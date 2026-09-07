import type { StateStorage } from 'zustand/middleware';

export const resilientLocalStorage: StateStorage = {
	getItem: (name) => {
		try {
			return localStorage.getItem(name);
		} catch {
			return null;
		}
	},
	removeItem: (name) => {
		try {
			localStorage.removeItem(name);
		} catch {
			// Persistence is best-effort; in-memory store state remains authoritative.
		}
	},
	setItem: (name, value) => {
		try {
			localStorage.setItem(name, value);
		} catch {
			// Persistence is best-effort; in-memory store state remains authoritative.
		}
	},
};
