/** Map native scroll position to the scene centers, holding the first and last scenes at the ends. */
export function createReel(root) {
  const sections = Array.from(root.querySelectorAll('.sec'));
  let centers = [];

  function measure() {
    const y0 = window.scrollY;
    centers = sections.map((section) => {
      const rect = section.getBoundingClientRect();
      return rect.top + y0 + rect.height / 2;
    });
  }

  function progress() {
    const y = window.scrollY + window.innerHeight / 2;
    if (y <= centers[0]) return 0;
    for (let i = 0; i < centers.length - 1; i++) {
      if (y < centers[i + 1]) return i + (y - centers[i]) / (centers[i + 1] - centers[i]);
    }
    return centers.length - 1;
  }

  measure();
  return { measure, progress };
}
