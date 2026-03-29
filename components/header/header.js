// Load and inject header into the page
async function loadHeader(customTitle = null, customSubtitle = null) {
    try {
        const componentRoot = window.location.pathname.includes('/pages/') ? '../components/header' : 'components/header';
        const response = await fetch(`${componentRoot}/header.html`);
        const headerHTML = await response.text();
        
        // Insert header as first element in body
        const headerContainer = document.createElement('div');
        headerContainer.innerHTML = headerHTML;
        const header = headerContainer.firstChild;
        
        document.body.insertBefore(header, document.body.firstChild);
        
        // Use custom values passed as parameters, or check window variables, or use defaults
        const title = customTitle || window.pageTitle || null;
        const subtitle = customSubtitle || window.pageSubtitle || null;
        
        // Update header content if custom values provided
        if (title) {
            const h1 = header.querySelector('h1');
            if (h1) h1.textContent = title;
        }
        
        if (subtitle) {
            const p = header.querySelector('p');
            if (p) p.textContent = subtitle;
        }
    } catch (error) {
        console.error('Error loading header:', error);
    }
}

// Load header when DOM is ready (checks for window.pageTitle and window.pageSubtitle)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => loadHeader());
} else {
    loadHeader();
}
