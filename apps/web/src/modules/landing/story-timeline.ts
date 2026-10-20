import { segment } from '@web/modules/landing/use-story-progress'

// The v15 prototype's gathering, viewport handoff, map dive, portal and hawker-stall handoff
// are coordinated here so each element has one owner and scrubbing is reversible.
export function storyTimeline(progress: number, reduced = false) {
  if (reduced)
    return {
      collect: 1,
      handoff: 1,
      neighbourhood: 1,
      scan: 1,
      scanner: 0,
      found: 0,
      zoom: 0,
      route: 0,
      portalPin: 0,
      portal: 0,
      offer: 1,
      transfer: 1,
    }
  return {
    collect: segment(progress, 0.08, 0.24),
    handoff: segment(progress, 0.25, 0.34),
    neighbourhood: segment(progress, 0.34, 0.39),
    scan: segment(progress, 0.465, 0.53),
    scanner: segment(progress, 0.45, 0.47) * (1 - segment(progress, 0.53, 0.55)),
    found: segment(progress, 0.515, 0.53) * (1 - segment(progress, 0.55, 0.58)),
    zoom: segment(progress, 0.54, 0.65),
    route: segment(progress, 0.53, 0.64),
    portalPin: segment(progress, 0.61, 0.64) * (1 - segment(progress, 0.69, 0.72)),
    portal: segment(progress, 0.65, 0.735),
    offer: segment(progress, 0.715, 0.78),
    transfer: segment(progress, 0.78, 0.813),
  }
}

export const storyChapter = (progress: number) =>
  progress < 0.1
    ? 0
    : progress < 0.25
      ? 1
      : progress < 0.34
        ? 2
        : progress < 0.45
          ? 3
          : progress < 0.54
            ? 4
            : progress < 0.66
              ? 5
              : progress < 0.81
                ? 6
                : progress < 0.92
                  ? 7
                  : 8
