// Runs before paint so a saved preference never flashes the opposite theme.
export const themeScript = `try{document.documentElement.dataset.theme=['light','dark'].includes(localStorage.getItem('ovela-theme'))?localStorage.getItem('ovela-theme'):'system'}catch{document.documentElement.dataset.theme='system'}`;
