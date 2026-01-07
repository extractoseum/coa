import { useState, useEffect, useRef, useMemo } from 'react';
import { RefreshCw, X, Tag, Check } from 'lucide-react';
import { authFetch } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';

interface TagWithCount {
    tag: string;
    count: number;
}

interface ShopifyTagSelectorProps {
    selectedTags: string[];
    onChange: (tags: string[]) => void;
    maxTags?: number;
}

const API_BASE = '/api/v1';

export default function ShopifyTagSelector({ selectedTags, onChange, maxTags = 10 }: ShopifyTagSelectorProps) {
    const { theme } = useTheme();
    const [allTags, setAllTags] = useState<TagWithCount[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchValue, setSearchValue] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLUListElement>(null);

    // Load tags on mount
    useEffect(() => {
        loadTags();
    }, []);

    const loadTags = async () => {
        setLoading(true);
        try {
            const response = await authFetch(`${API_BASE}/push/tags`);
            const data = await response.json();
            if (data.success && data.tags) {
                setAllTags(data.tags);
            }
        } catch (error) {
            console.error('Error loading Shopify tags:', error);
        } finally {
            setLoading(false);
        }
    };

    const refreshTags = async () => {
        setLoading(true);
        try {
            await authFetch(`${API_BASE}/push/tags/refresh`, { method: 'POST' });
            // Wait a bit then reload
            setTimeout(loadTags, 2000);
        } catch (error) {
            console.error('Error refreshing tags:', error);
            setLoading(false);
        }
    };

    // Filter tags based on search
    const filteredTags = useMemo(() => {
        const search = searchValue.toLowerCase().trim();
        let filtered = allTags;

        if (search) {
            filtered = allTags.filter(t => t.tag.toLowerCase().includes(search));
        }

        return filtered
            .sort((a, b) => {
                // Selected tags first
                const aSelected = selectedTags.includes(a.tag);
                const bSelected = selectedTags.includes(b.tag);
                if (aSelected && !bSelected) return -1;
                if (!aSelected && bSelected) return 1;
                // Then by count
                return b.count - a.count;
            })
            .slice(0, 30);
    }, [allTags, searchValue, selectedTags]);

    const toggleTag = (tag: string) => {
        if (selectedTags.includes(tag)) {
            onChange(selectedTags.filter(t => t !== tag));
        } else if (selectedTags.length < maxTags) {
            onChange([...selectedTags, tag]);
        }
    };

    const removeTag = (tag: string) => {
        onChange(selectedTags.filter(t => t !== tag));
    };

    // Handle keyboard navigation
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!isOpen && e.key === 'ArrowDown') {
            setIsOpen(true);
            return;
        }

        if (isOpen) {
            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    setHighlightedIndex(prev =>
                        prev < filteredTags.length - 1 ? prev + 1 : prev
                    );
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    setHighlightedIndex(prev => prev > 0 ? prev - 1 : 0);
                    break;
                case 'Enter':
                    e.preventDefault();
                    if (highlightedIndex >= 0 && filteredTags[highlightedIndex]) {
                        toggleTag(filteredTags[highlightedIndex].tag);
                    }
                    break;
                case 'Escape':
                    setIsOpen(false);
                    break;
            }
        }
    };

    // Scroll highlighted item into view
    useEffect(() => {
        if (listRef.current && highlightedIndex >= 0) {
            const item = listRef.current.children[highlightedIndex] as HTMLElement;
            item?.scrollIntoView({ block: 'nearest' });
        }
    }, [highlightedIndex]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (inputRef.current && !inputRef.current.contains(e.target as Node) &&
                listRef.current && !listRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Get total users that will see this COA
    const totalUsers = useMemo(() => {
        return selectedTags.reduce((sum, tag) => {
            const found = allTags.find(t => t.tag === tag);
            return sum + (found?.count || 0);
        }, 0);
    }, [selectedTags, allTags]);

    return (
        <div className="space-y-3">
            {/* Selected tags */}
            {selectedTags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {selectedTags.map(tag => {
                        const tagInfo = allTags.find(t => t.tag === tag);
                        return (
                            <span
                                key={tag}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-amber-500/20 text-amber-400 border border-amber-500/30"
                            >
                                <Tag size={12} />
                                {tag}
                                {tagInfo && (
                                    <span className="text-amber-500/60">({tagInfo.count})</span>
                                )}
                                <button
                                    type="button"
                                    onClick={() => removeTag(tag)}
                                    className="ml-1 hover:text-amber-300"
                                >
                                    <X size={12} />
                                </button>
                            </span>
                        );
                    })}
                </div>
            )}

            {/* Search input */}
            <div className="flex gap-2">
                <div className="flex-1 relative">
                    <input
                        ref={inputRef}
                        type="text"
                        value={searchValue}
                        onChange={(e) => {
                            setSearchValue(e.target.value);
                            setIsOpen(true);
                            setHighlightedIndex(-1);
                        }}
                        onFocus={() => setIsOpen(true)}
                        onKeyDown={handleKeyDown}
                        disabled={loading}
                        placeholder={loading ? 'Cargando tags...' : 'Buscar tag de Shopify...'}
                        className="w-full px-3 py-2 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 disabled:opacity-50"
                        style={{ backgroundColor: theme.cardBg2, color: theme.text, borderWidth: '1px', borderStyle: 'solid', borderColor: theme.border }}
                    />

                    {/* Dropdown */}
                    {isOpen && !loading && filteredTags.length > 0 && (
                        <ul
                            ref={listRef}
                            className="absolute z-50 w-full mt-1 max-h-48 overflow-auto rounded-lg shadow-lg"
                            style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.border}` }}
                        >
                            {filteredTags.map((item, index) => {
                                const isSelected = selectedTags.includes(item.tag);
                                return (
                                    <li
                                        key={item.tag}
                                        onClick={() => toggleTag(item.tag)}
                                        className="px-3 py-2 cursor-pointer flex justify-between items-center text-sm"
                                        style={{
                                            backgroundColor: index === highlightedIndex ? `${theme.accent}20` : 'transparent',
                                            color: isSelected ? '#f59e0b' : theme.text,
                                            fontWeight: isSelected ? 500 : 400
                                        }}
                                    >
                                        <span className="flex items-center gap-2 truncate">
                                            {isSelected && <Check size={14} className="text-amber-500" />}
                                            {item.tag}
                                        </span>
                                        <span className="text-xs ml-2 flex-shrink-0" style={{ color: theme.textMuted }}>
                                            {item.count} usuarios
                                        </span>
                                    </li>
                                );
                            })}
                        </ul>
                    )}

                    {/* No results message */}
                    {isOpen && !loading && searchValue && filteredTags.length === 0 && (
                        <div
                            className="absolute z-50 w-full mt-1 p-3 rounded-lg shadow-lg text-sm"
                            style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.border}`, color: theme.textMuted }}
                        >
                            No se encontraron tags con "{searchValue}"
                        </div>
                    )}
                </div>
                <button
                    type="button"
                    onClick={refreshTags}
                    disabled={loading}
                    className="px-3 py-2 rounded-lg disabled:opacity-50 transition-colors"
                    style={{ backgroundColor: theme.cardBg2, border: `1px solid ${theme.border}`, color: theme.text }}
                    title="Actualizar tags desde Shopify"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {/* Summary */}
            {selectedTags.length > 0 && (
                <p className="text-xs text-amber-500">
                    {selectedTags.length} tag{selectedTags.length > 1 ? 's' : ''} seleccionado{selectedTags.length > 1 ? 's' : ''}
                    {totalUsers > 0 && ` - Aproximadamente ${totalUsers.toLocaleString()} usuarios podran ver este COA`}
                </p>
            )}
        </div>
    );
}
