# Music Practice Hub

A comprehensive web application for music practice tools and resources.

## Features

- **Metronome**: Keep perfect time with adjustable tempo (implemented)
  - Tempo control with slider and number input
  - Time signature input (e.g., 3/4, 6/8)
  - Multiple sound options (beep, boop, click, wood block)
  - Advanced tempo ramping (gradual tempo increase over time)
- **Tuner**: Digital instrument tuner
- **Practice Planner**: Create practice plans and track progress with interactive checklists
- **Resources**: Tutorials, tips, and learning materials

## Getting Started

1. Open `index.html` in your web browser to view the home page.
2. For a local development server, you can use Python's built-in server:
   - Navigate to the project directory
   - Run `python -m http.server 8000`
   - Open `http://localhost:8000` in your browser

## Project Structure

- `index.html`: Main home page
- `style.css`: Stylesheet for the application
- `app.js`: Main JavaScript file for functionality

## Development

This is a static website built with HTML, CSS, and JavaScript. No build process is required.

## Troubleshooting

- If the page doesn't load properly, ensure all files are in the same directory
- Check the browser console for any JavaScript errors
- Make sure your browser supports modern CSS Grid and Flexbox

## Future Enhancements

- Implement individual tool pages
- Add user authentication
- Integrate with music APIs
- Add offline functionality