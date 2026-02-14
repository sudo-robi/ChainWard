
"use client";

import { useEffect } from 'react';

const KeyboardShortcuts = () => {
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // ALT+T for Theme Toggle
            if (e.altKey &&e.key.toLowerCase() === 't') {
                const isLight = document.body.classList.contains('light');
                const newTheme = isLight ? 'dark' : 'light';
                document.body.classList.toggle('light', !isLight);
                localStorage.setItem('theme', newTheme);
            }

            // / to focus search
            if (e.key === '/') {
                const searchInput = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement;
                if (searchInput) {
                    e.preventDefault();
                    searchInput.focus();
                }
            }

            // ESC to blur or close
            if (e.key === 'Escape') {
                (document.activeElement as HTMLElement)?.blur();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    return null;
};

export default KeyboardShortcuts;
