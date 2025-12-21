export interface NavigationItem {
    id: string;
    label: string;
    icon: string;
    href?: string;
    type: 'main' | 'user' | 'admin';
    parent_id?: string;
    order_index: number;
    is_external?: boolean;
    is_auth_only?: boolean;
    is_admin_only?: boolean;
    is_active?: boolean;
    children?: NavigationItem[];
}

export type CreateNavigationItemDTO = Omit<NavigationItem, 'id' | 'children' | 'is_active'>;
export type UpdateNavigationItemDTO = Partial<CreateNavigationItemDTO> & { is_active?: boolean };
