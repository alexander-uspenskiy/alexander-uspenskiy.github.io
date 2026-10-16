// Race director: lap counting with monotonic progress, positions, finish & end-of-race rules.
export const FINISH_TIMEOUT = 20;   // s after the first finisher before the race is called

export function createDirector(track, laps, opts = {}) {
  const L = track.length;
  const maxTime = opts.maxTime ?? 900;
  const d = {
    track, laps, firstFinishT: null, finishCount: 0, over: false,
    ranks: [],
    initCar(car) {
      const s = car.proj.s;
      car.lastS = s;
      car.raw = s > L / 2 ? s - L : s;
      car.progress = car.raw;
      car.lapsDone = 0;
      car.lapStartT = 0;
      car.finished = false; car.finishTime = null; car.position = 0;
    },
    /** t = race time (s). Updates progress, laps, finishes; returns nothing. */
    update(cars, t, emit) {
      for (const car of cars) {
        if (car.finished) continue;
        const s = car.proj.s;
        let ds = s - car.lastS;
        ds -= Math.round(ds / L) * L;
        car.lastS = s;
        if (Math.abs(ds) > L / 4) continue;       // projection glitch
        car.raw += ds;
        if (car.raw > car.progress) car.progress = car.raw;
        if (car.wrecked) continue;
        const done = car.progress < 0 ? 0 : Math.floor(car.progress / L);
        while (car.lapsDone < done && car.lapsDone < laps) {
          car.lapsDone++;
          const over = car.progress - car.lapsDone * L;
          const ct = t - over / Math.max(car.speed, 1);
          emit('lap', { carId: car.id, lap: car.lapsDone, lapTime: ct - car.lapStartT });
          car.lapStartT = ct;
          if (car.lapsDone >= laps) {
            car.finished = true;
            car.finishTime = Math.max(0, ct);
            car.position = ++d.finishCount;
            if (d.firstFinishT === null) d.firstFinishT = t;
            emit('finish', { carId: car.id, position: car.position, time: car.finishTime });
          }
        }
      }
      d.rank(cars);
      if (!d.over) {
        const active = cars.filter((c) => !c.wrecked && !c.finished);
        if (active.length === 0) d.over = true;
        else if (d.firstFinishT !== null && t - d.firstFinishT >= FINISH_TIMEOUT) d.over = true;
        else if (t >= maxTime) d.over = true;
      }
    },
    rank(cars) {
      const key = (c) => (c.finished ? 0 : c.wrecked ? 2 : 1);
      const sorted = cars.slice().sort((a, b) => {
        const ka = key(a), kb = key(b);
        if (ka !== kb) return ka - kb;
        if (ka === 0) return a.position - b.position;
        if (b.progress !== a.progress) return b.progress - a.progress;
        return a.id - b.id;
      });
      d.ranks = sorted;
      sorted.forEach((c, i) => { c.rank = i + 1; });
      return sorted;
    },
    lapOf(car) {
      if (car.finished) return laps;
      return Math.min(laps, (car.progress < 0 ? 0 : Math.floor(car.progress / L)) + 1);
    },
    sOf(car) { return ((car.raw % L) + L) % L; },
  };
  return d;
}
