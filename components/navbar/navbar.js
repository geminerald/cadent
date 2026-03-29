// Load and inject navbar into the page
async function loadNavbar() {
    try {
        const componentRoot = window.location.pathname.includes('/pages/') ? '../components/navbar' : 'components/navbar';
        const response = await fetch(`${componentRoot}/navbar.html`);
        const navbarHTML = await response.text();
        
        // Insert navbar - after header if it exists, otherwise at the beginning
        const header = document.querySelector('header');
        const navContainer = document.createElement('div');
        navContainer.innerHTML = navbarHTML;
        
        if (header && header.nextSibling) {
            header.parentNode.insertBefore(navContainer.firstChild, header.nextSibling);
        } else if (header) {
            header.parentNode.appendChild(navContainer.firstChild);
        } else {
            document.body.insertBefore(navContainer.firstChild, document.body.firstChild);
        }
        
        // Adjust navigation URLs for folder structure and highlight active page
        const isPageFolder = window.location.pathname.includes('/pages/');
        const navLinks = document.querySelectorAll('nav a');
        const currentPage = window.location.pathname.split('/').pop() || 'index.html';
        const currentKey = currentPage === 'index.html' ? 'index' : currentPage.replace('.html', '');

        const linkPath = (pageKey) => {
            if (pageKey === 'index') {
                return isPageFolder ? '../index.html' : 'index.html';
            }
            return isPageFolder ? `${pageKey}.html` : `pages/${pageKey}.html`;
        };

        navLinks.forEach(link => {
            const pageKey = link.dataset.page;
            if (!pageKey) return;

            link.href = linkPath(pageKey);
            link.classList.toggle('active', pageKey === currentKey);
        });
    } catch (error) {
        console.error('Error loading navbar:', error);
    }
}

// Load navbar when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadNavbar);
} else {
    loadNavbar();
}
