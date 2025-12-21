import type { NavigationItem, CreateNavigationItemDTO, UpdateNavigationItemDTO } from '../types/navigation';

const API_URL = '/api/v1/navigation';

export const getNavigationItems = async (type?: string, isAdmin?: boolean): Promise<{ success: boolean; items: NavigationItem[] }> => {
    const params = new URLSearchParams();
    if (type) params.append('type', type);
    if (isAdmin) params.append('isAdmin', 'true');

    const res = await fetch(`${API_URL}?${params.toString()}`);
    return res.json();
};

export const createNavigationItem = async (data: CreateNavigationItemDTO): Promise<{ success: boolean; item: NavigationItem }> => {
    const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    return res.json();
};

export const updateNavigationItem = async (id: string, data: UpdateNavigationItemDTO): Promise<{ success: boolean; item: NavigationItem }> => {
    const res = await fetch(`${API_URL}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    return res.json();
};

export const deleteNavigationItem = async (id: string): Promise<{ success: boolean; message: string }> => {
    const res = await fetch(`${API_URL}/${id}`, {
        method: 'DELETE',
    });
    return res.json();
};

export const reorderNavigationItems = async (items: { id: string; order_index: number }[]): Promise<{ success: boolean; message: string }> => {
    const res = await fetch(`${API_URL}/reorder`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
    });
    return res.json();
};
