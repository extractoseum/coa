import React from 'react';

export function Screen(props: { id: string; children: React.ReactNode }) {
    return (
        <div data-screen-id={props.id} style={{ display: 'contents' }}>
            {props.children}
        </div>
    );
}
