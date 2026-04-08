import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { SampleItem } from "../types";

interface RankedListProps {
  items: SampleItem[];
  sortable: boolean;
  onReorder: (nextItems: SampleItem[]) => void;
  onInspect: (item: SampleItem) => void;
}

interface RankedRowProps {
  item: SampleItem;
  index: number;
  disabled: boolean;
  onInspect: (item: SampleItem) => void;
}

function RankedRow({ item, index, disabled, onInspect }: RankedRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled,
  });

  return (
    <div
      ref={setNodeRef}
      className={`ranked-row ${isDragging ? "dragging" : ""}`}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <button
        type="button"
        className="drag-handle"
        aria-label={`Drag ${item.displayName}`}
        disabled={disabled}
        {...attributes}
        {...listeners}
      >
        ::
      </button>

      <button type="button" className="ranked-row-main" onClick={() => onInspect(item)}>
        <span className="ranked-index">{index + 1}</span>
        <span className="ranked-swatch" style={{ background: item.color.hex }} />
        <span className="ranked-copy">
          <strong>{item.displayName}</strong>
          <small>
            {item.color.hex} | {item.brightness.score.toFixed(2)}
          </small>
        </span>
      </button>
    </div>
  );
}

export function RankedList({ items, sortable, onReorder, onInspect }: RankedListProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = items.findIndex((item) => item.id === active.id);
    const newIndex = items.findIndex((item) => item.id === over.id);

    if (oldIndex === -1 || newIndex === -1) {
      return;
    }

    onReorder(arrayMove(items, oldIndex, newIndex));
  }

  return (
    <section className="panel ranked-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Ranked List</span>
          <h3>Manual order control</h3>
        </div>
        <span className="helper-text">
          {sortable ? "Drag rows to fine-tune the final order." : "Clear search to drag-reorder."}
        </span>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
          <div className="ranked-list">
            {items.length ? (
              items.map((item, index) => (
                <RankedRow
                  key={item.id}
                  item={item}
                  index={index}
                  disabled={!sortable}
                  onInspect={onInspect}
                />
              ))
            ) : (
              <div className="empty-state compact">Your ranked swatches will appear here.</div>
            )}
          </div>
        </SortableContext>
      </DndContext>
    </section>
  );
}
