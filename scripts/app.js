// Music Practice Hub - Main JavaScript file
// This file will contain the logic for various music practice tools

document.addEventListener('DOMContentLoaded', function() {
    console.log('Music Practice Hub loaded successfully!');
    
    // Add smooth scrolling for in-page anchor links only
    const navLinks = document.querySelectorAll('nav a');
    navLinks.forEach(link => {
        const href = link.getAttribute('href');
        if (!href || !href.startsWith('#')) {
            return;
        }

        link.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = href.substring(1);
            const targetSection = document.getElementById(targetId);
            if (targetSection) {
                targetSection.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });
});