/** Geometry shared by rendering, hit targets, and Immich's virtual scrolling. */
export function ovelaMobileGrid(count: number, width: number) {
  const gap = Math.min(2, width / 6);
  const size = (width - gap * 2) / 3;
  const position = (index: number) => ({
    top: Math.floor(index / 3) * (size + gap),
    left: (index % 3) * (size + gap),
    width: size,
    height: size,
  });
  return {
    containerWidth: width,
    containerHeight: count ? Math.ceil(count / 3) * (size + gap) - gap : 0,
    getTop: (i: number) => position(i).top,
    getLeft: (i: number) => position(i).left,
    getWidth: (i: number) => position(i).width,
    getHeight: (i: number) => position(i).height,
    getPosition: position,
  };
}
