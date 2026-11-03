// Keep data and feature modules independent of application startup.
function render(){ document.dispatchEvent(new Event('mypa:render')); }
function go(tab){ document.dispatchEvent(new CustomEvent('mypa:navigate', { detail: tab })); }

export { render, go };
