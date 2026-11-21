import { useState } from 'react';
import { View } from 'react-native';
import { Button, Chip, Chips, Field } from '../components/ui';
import { messageOf } from '../lib/errors';
import { addCategory, Category } from './model';

interface CategoryPickerProps {
  flatId: string;
  categories: Category[];
  selectedId: string | null;
  onSelect: (category: Category) => void;
  onAdded: (category: Category) => void;
}

/** Category chips plus "New", which adds a category for the whole flat. */
export function CategoryPicker({ flatId, categories, selectedId, onSelect, onAdded }: CategoryPickerProps) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const trimmed = name.trim();
    if (trimmed.length === 0 || trimmed.length > 30) return setError('Use 1 to 30 characters.');
    if (categories.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) return setError('That category already exists.');
    setBusy(true);
    try {
      const created = await addCategory(flatId, trimmed);
      onAdded(created);
      onSelect(created);
      setAdding(false);
      setName('');
      setError(null);
    } catch (e: unknown) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 12 }}>
      <Chips>
        {categories.map((c) => (
          <Chip key={c.id} label={c.name} selected={c.id === selectedId} onPress={() => onSelect(c)} />
        ))}
        <Chip label="New" icon="plus" selected={adding} onPress={() => setAdding((v) => !v)} />
      </Chips>
      {adding ? (
        <>
          <Field
            label="New category"
            value={name}
            onChangeText={(t) => {
              setName(t);
              setError(null);
            }}
            maxLength={30}
            error={error}
            placeholder="For example: Cook, Newspaper"
          />
          <Button label="Add category" variant="secondary" onPress={() => void save()} busy={busy} />
        </>
      ) : null}
    </View>
  );
}
