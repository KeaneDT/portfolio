export function initDetails({ onOpen, onClose } = {}) {
  const dialog = document.getElementById('detail-dialog');
  const title = document.getElementById('detail-title');
  const content = document.getElementById('detail-content');
  const closeButton = dialog?.querySelector('.detail-dialog__close');
  const templates = new Map(
    Array.from(document.querySelectorAll('template[data-detail-template]'))
      .map((template) => [template.dataset.detailTemplate, template]),
  );
  let opener = null;

  if (!dialog || !title || !content || !closeButton) return { get isOpen() { return false; } };

  const close = () => dialog.close();

  document.addEventListener('click', (event) => {
    const link = event.target.closest?.('a[data-detail]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (link.hasAttribute('download') || (link.target && link.target !== '_self')) return;

    const template = templates.get(link.dataset.detail);
    if (!template || typeof dialog.showModal !== 'function' || dialog.open) return;

    const projectTitle = link.querySelector('h3')?.textContent.trim();
    const modalTitle = projectTitle || link.dataset.detailTitle || (link.dataset.detail === 'about' ? 'About me' : 'Experience');
    event.preventDefault();
    opener = link;
    title.textContent = modalTitle;
    content.replaceChildren(template.content.cloneNode(true));
    dialog.showModal();
    document.documentElement.classList.add('detail-open');
    document.body.classList.add('detail-open');
    onOpen?.();
    closeButton.focus({ preventScroll: true });
  });

  closeButton.addEventListener('click', close);
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right ||
        event.clientY < bounds.top || event.clientY > bounds.bottom) close();
  });
  dialog.addEventListener('close', () => {
    document.documentElement.classList.remove('detail-open');
    document.body.classList.remove('detail-open');
    onClose?.();
    const previousOpener = opener;
    opener = null;
    previousOpener?.focus({ preventScroll: true });
  });

  return { get isOpen() { return dialog.open; } };
}
