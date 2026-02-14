
"use client";

import React, { useEffect, useState } from 'react';

const ThemeToggle = () => {
    const [theme, setTheme] = useState<'dark' | 'light'>('dark');

    useEffect(() => {
        const savedTheme = localStorage.getItem('theme') as 'dark' | 'light';
        if (savedTheme) {
            setTheme(savedTheme);
            document.body.classList.toggle('light', savedTheme === 'light');
        }
    }, []);

    const toggleTheme = () => {
        const newTheme = theme === 'dark' ? 'light' : 'dark';
        setTheme(newTheme);
        localStorage.setItem('theme', newTheme);
        document.body.classList.toggle('light', newTheme === 'light');
    };

    return (
        <button
            onClick={toggleTheme}
            className="p-2 rounded-full bg-card border border-card-border hover:bg-background transition-colors flex items-center justify-center w-10 h-10"
            aria-label="Toggle Theme"
        >
            {theme === 'dark' ? (
                <span className="text-xl">☀️</span>
            ) : (
                <span className="text-xl">🌙</span>
            )}
        </button>
    );
};

export default ThemeToggle;
