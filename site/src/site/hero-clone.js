/** Build the visual reel twin from the live hero so copy and layout cannot drift. */
export function appendHeroClone(root) {
  const hero = root.querySelector('#top');
  if (!hero) throw new Error('The reel needs a #top hero section to clone.');

  const clone = hero.cloneNode(true);
  clone.classList.add('sec--clone');
  clone.removeAttribute('id');
  clone.removeAttribute('data-section');
  clone.setAttribute('aria-hidden', 'true');
  clone.inert = true;

  // Keep the duplicate heading out of the document's top-level heading outline.
  const title = clone.querySelector('h1');
  if (title) {
    const twinTitle = document.createElement('h2');
    for (const attribute of title.attributes) {
      if (attribute.name !== 'id') twinTitle.setAttribute(attribute.name, attribute.value);
    }
    twinTitle.replaceChildren(...title.childNodes);
    title.replaceWith(twinTitle);
  }

  clone.querySelectorAll('[id]').forEach((element) => element.removeAttribute('id'));
  root.append(clone);
  return clone;
}
