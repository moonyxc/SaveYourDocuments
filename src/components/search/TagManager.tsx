import React, { useState } from 'react';
import { Tag } from '../../types/document';
import { Badge } from '../ui/Badge';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';

interface TagManagerProps {
  tags: Tag[];
  selectedTags: string[];
  onTagSelect: (tag: string) => void;
  onTagCreate: (tag: string) => void;
  onTagDelete?: (tagId: number) => void;
}

export function TagManager({ tags, selectedTags, onTagSelect, onTagCreate, onTagDelete }: TagManagerProps) {
  const [newTag, setNewTag] = useState('');

  const handleCreate = () => {
    const trimmed = newTag.trim();
    if (!trimmed) {
      return;
    }
    const exists = tags.some((t) => t.name.toLowerCase() === trimmed.toLowerCase());
    if (exists) {
      setNewTag('');
      return;
    }
    onTagCreate(trimmed);
    setNewTag('');
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          placeholder="Neuer Tag"
          aria-label="Neuer Tag"
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
        />
        <Button type="button" onClick={handleCreate} size="sm">
          Hinzufügen
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <span key={tag.id} className="inline-flex items-center gap-1">
            <button
              type="button"
              onClick={() => onTagSelect(tag.name)}
              className={`transition-opacity ${selectedTags.includes(tag.name) ? 'opacity-100' : 'opacity-50 hover:opacity-75'}`}
            >
              <Badge color="blue">{tag.name}</Badge>
            </button>
            {onTagDelete && (
              <button
                type="button"
                onClick={() => onTagDelete(tag.id)}
                aria-label={`Tag ${tag.name} löschen`}
                className="text-slate-500 hover:text-red-400"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}
