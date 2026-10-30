export function createSpsNodeConnectionLifetime() {
  let generation = 0;
  let current = null;
  const isCurrent = ticket => Boolean(ticket && current === ticket && ticket.generation === generation);

  return Object.freeze({
    begin() {
      generation += 1;
      current = Object.freeze({ generation });
      return current;
    },
    stop() {
      generation += 1;
      current = null;
    },
    current() {
      return current;
    },
    isCurrent,
    assertCurrent(ticket) {
      if (!isCurrent(ticket)) throw new Error("SPS Desktop Node connection is no longer current.");
    },
  });
}

export async function runSpsNodeConnectionSteps(assertCurrent, steps) {
  let result;
  for (const step of steps) {
    assertCurrent();
    try {
      result = await step();
    } catch (error) {
      // A provider error from an operation that outlived its connection is
      // stale too. Surface the ownership failure instead of leaking it to a
      // caller that may still be handling the previous connection.
      assertCurrent();
      throw error;
    }
    assertCurrent();
  }
  return result;
}
