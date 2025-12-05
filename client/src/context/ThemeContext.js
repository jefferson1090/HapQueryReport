import { createContext } from 'react';

export const ThemeContext = createContext();

export const THEMES = {
    default: {
        name: 'Padrão (Azul)',
        bg: 'bg-gray-100', // Main background
        navbar: 'bg-white', // Top Bar background
        navbarText: 'text-gray-700',
        text: 'text-gray-700',
        primaryBtn: 'bg-blue-600 hover:bg-blue-700 text-white',
        secondaryBtn: 'bg-gray-100 hover:bg-gray-200 text-gray-600',
        accent: 'text-blue-600',
        border: 'border-gray-200',
        input: 'bg-white text-gray-900',
        panel: 'bg-white',
        tabActive: 'bg-blue-50 text-blue-600 border-blue-600',
        tabInactive: 'text-gray-500 hover:bg-gray-50 hover:text-blue-500'
    },
    dark: {
        name: 'Modo Escuro',
        bg: 'bg-gray-900',
        navbar: 'bg-gray-800',
        navbarText: 'text-gray-200',
        text: 'text-gray-200',
        primaryBtn: 'bg-indigo-600 hover:bg-indigo-700 text-white',
        secondaryBtn: 'bg-gray-700 hover:bg-gray-600 text-gray-200',
        accent: 'text-indigo-400',
        border: 'border-gray-700',
        input: 'bg-gray-700 text-white border-gray-600',
        panel: 'bg-gray-800',
        tabActive: 'bg-gray-700 text-indigo-400 border-indigo-400',
        tabInactive: 'text-gray-400 hover:bg-gray-700 hover:text-indigo-300'
    },
    ubuntu: {
        name: 'Ubuntu',
        bg: 'bg-[#fdf6e3]',
        navbar: 'bg-[#300a24]',
        navbarText: 'text-white',
        text: 'text-[#300a24]',
        primaryBtn: 'bg-[#e95420] hover:bg-[#c7461b] text-white',
        secondaryBtn: 'bg-[#aea79f] hover:bg-[#9e968d] text-white',
        accent: 'text-[#e95420]',
        border: 'border-[#aea79f]',
        input: 'bg-white text-[#300a24]',
        panel: 'bg-white',
        tabActive: 'bg-[#4e103b] text-[#e95420] border-[#e95420]',
        tabInactive: 'text-gray-300 hover:bg-[#4e103b] hover:text-[#e95420]'
    },
    forest: {
        name: 'Floresta',
        bg: 'bg-stone-100',
        navbar: 'bg-[#1c2e1f]',
        navbarText: 'text-stone-200',
        text: 'text-[#1c2e1f]',
        primaryBtn: 'bg-[#2d4a33] hover:bg-[#3a5e42] text-white',
        secondaryBtn: 'bg-stone-200 hover:bg-stone-300 text-stone-700',
        accent: 'text-[#2d4a33]',
        border: 'border-stone-200',
        input: 'bg-white text-stone-800',
        panel: 'bg-[#fdfbf7]',
        tabActive: 'bg-[#2d4a33] text-white border-[#4caf50]',
        tabInactive: 'text-stone-400 hover:bg-[#2d4a33] hover:text-white'
    },
    ocean: {
        name: 'Oceano',
        bg: 'bg-cyan-50',
        navbar: 'bg-white',
        navbarText: 'text-slate-700',
        text: 'text-slate-700',
        primaryBtn: 'bg-cyan-600 hover:bg-cyan-700 text-white',
        secondaryBtn: 'bg-cyan-100 hover:bg-cyan-200 text-cyan-800',
        accent: 'text-cyan-600',
        border: 'border-cyan-200',
        input: 'bg-white text-slate-700',
        panel: 'bg-white',
        tabActive: 'bg-cyan-50 text-cyan-700 border-cyan-600',
        tabInactive: 'text-slate-500 hover:bg-cyan-50 hover:text-cyan-600'
    },
    dracula: {
        name: 'Dracula',
        bg: 'bg-[#282a36]',
        navbar: 'bg-[#44475a]',
        navbarText: 'text-[#f8f8f2]',
        text: 'text-[#f8f8f2]',
        primaryBtn: 'bg-[#bd93f9] hover:bg-[#ff79c6] text-[#282a36]',
        secondaryBtn: 'bg-[#6272a4] hover:bg-[#50fa7b] text-white',
        accent: 'text-[#ff79c6]',
        border: 'border-[#6272a4]',
        input: 'bg-[#282a36] text-[#f8f8f2] border-[#6272a4]',
        panel: 'bg-[#282a36]',
        tabActive: 'bg-[#282a36] text-[#ff79c6] border-[#ff79c6]',
        tabInactive: 'text-[#6272a4] hover:bg-[#282a36] hover:text-[#bd93f9]'
    },
    military: {
        name: 'Militar',
        bg: 'bg-[#f5f5f5]',
        navbar: 'bg-[#3e2723]',
        navbarText: 'text-[#efebe9]',
        text: 'text-[#3e2723]',
        primaryBtn: 'bg-[#558b2f] hover:bg-[#33691e] text-white',
        secondaryBtn: 'bg-[#795548] hover:bg-[#5d4037] text-white',
        accent: 'text-[#33691e]',
        border: 'border-[#8d6e63]',
        input: 'bg-white text-gray-900 border-[#8d6e63]',
        panel: 'bg-[#fafafa]',
        tabActive: 'bg-[#5d4037] text-[#efebe9] border-[#fafafa]',
        tabInactive: 'text-[#efebe9] opacity-70 hover:opacity-100'
    }
};
