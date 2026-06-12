// First-visit instructions modal, shared by the tool pages.
//
// Each page provides:
//   - a #page-help "?" button inside a .help-host section
//   - a #page-help-modal (.session-modal) carrying a data-help-key storage key,
//     a .modal-backdrop, and a .help-close dismiss button
//
// The modal pops up automatically until it has been dismissed once on this
// device (tracked per page via the data-help-key), then only via the button.

document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('page-help-modal');
    const openBtn = document.getElementById('page-help');
    if (!modal || !openBtn) return;

    const storageKey = modal.dataset.helpKey || 'cadentHelpSeen';

    const show = () => { modal.style.display = 'flex'; };
    const dismiss = () => {
        modal.style.display = 'none';
        localStorage.setItem(storageKey, 'true');
    };

    openBtn.addEventListener('click', show);
    modal.querySelector('.help-close').addEventListener('click', dismiss);
    modal.querySelector('.modal-backdrop').addEventListener('click', dismiss);

    if (!localStorage.getItem(storageKey)) show();
});
