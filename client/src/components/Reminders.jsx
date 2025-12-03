import React, { useState, useEffect } from 'react';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragOverlay
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const COLUMNS = {
    PENDING: { id: 'PENDING', title: 'Pendente', color: 'bg-yellow-50', headerColor: 'bg-yellow-100', borderColor: 'border-yellow-200', textColor: 'text-yellow-800' },
    IN_PROGRESS: { id: 'IN_PROGRESS', title: 'Em Andamento', color: 'bg-orange-50', headerColor: 'bg-orange-100', borderColor: 'border-orange-200', textColor: 'text-orange-800' },
    OVERDUE: { id: 'OVERDUE', title: 'Em Atraso', color: 'bg-red-50', headerColor: 'bg-red-100', borderColor: 'border-red-200', textColor: 'text-red-800' },
    COMPLETED: { id: 'COMPLETED', title: 'Concluído', color: 'bg-green-50', headerColor: 'bg-green-100', borderColor: 'border-green-200', textColor: 'text-green-800' }
};

function SortableItem({ reminder, onClick, onDelete, onEdit, onMove }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: reminder.id, data: { ...reminder } });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    const getStatusBadge = (status) => {
        const col = COLUMNS[status] || COLUMNS.PENDING;
        return <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${col.headerColor} ${col.textColor}`}>{col.title}</span>;
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            className="bg-white p-3 rounded-lg shadow-sm border border-gray-200 mb-3 cursor-grab hover:shadow-md transition-all group relative"
            onClick={(e) => {
                // Prevent opening modal if clicking buttons
                if (!e.target.closest('button')) onClick(reminder);
            }}
        >
            <div className="flex justify-between items-start mb-2">
                <h4 className="font-bold text-gray-800 text-sm line-clamp-2">{reminder.title}</h4>
                {getStatusBadge(reminder.status)}
            </div>

            {reminder.startDate && (
                <p className="text-xs text-gray-500 mb-2">📅 {new Date(reminder.startDate).toLocaleDateString()}</p>
            )}

            {reminder.image && (
                <div className="h-24 w-full rounded bg-gray-100 mb-2 overflow-hidden">
                    <img src={reminder.image} alt="Cover" className="w-full h-full object-cover" />
                </div>
            )}

            <p className="text-xs text-gray-600 line-clamp-3 mb-3">{reminder.description}</p>

            <div className="flex justify-between items-center pt-2 border-t border-gray-100 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="flex space-x-1">
                    {reminder.status === 'PENDING' && (
                        <button onClick={() => onMove(reminder.id, 'IN_PROGRESS')} title="Iniciar" className="p-1 hover:bg-orange-100 rounded text-orange-600">▶️</button>
                    )}
                    {reminder.status !== 'COMPLETED' && (
                        <button onClick={() => onMove(reminder.id, 'COMPLETED')} title="Concluir" className="p-1 hover:bg-green-100 rounded text-green-600">✅</button>
                    )}
                </div>
                <div className="flex space-x-1">
                    <button onClick={() => onEdit(reminder)} title="Editar" className="p-1 hover:bg-blue-100 rounded text-blue-600">✏️</button>
                    <button onClick={() => onDelete(reminder.id)} title="Excluir" className="p-1 hover:bg-red-100 rounded text-red-600">🗑️</button>
                </div>
            </div>
        </div>
    );
}

function KanbanColumn({ id, title, reminders, color, headerColor, borderColor, textColor, onClickCard, onDelete, onEdit, onMove }) {
    const { setNodeRef } = useDroppable({ id });

    return (
        <div className={`flex flex-col h-full rounded-xl ${color} border ${borderColor} min-w-[280px] w-full md:w-1/4`}>
            <div className={`p-3 rounded-t-xl ${headerColor} border-b ${borderColor} flex justify-between items-center sticky top-0 z-10`}>
                <h3 className={`font-bold ${textColor}`}>{title}</h3>
                <span className={`bg-white/50 px-2 py-0.5 rounded-full text-xs font-bold ${textColor}`}>{reminders.length}</span>
            </div>
            <div ref={setNodeRef} className="p-2 flex-1 overflow-y-auto">
                <SortableContext items={reminders.map(r => r.id)} strategy={verticalListSortingStrategy}>
                    {reminders.map(reminder => (
                        <SortableItem
                            key={reminder.id}
                            reminder={reminder}
                            onClick={onClickCard}
                            onDelete={onDelete}
                            onEdit={onEdit}
                            onMove={onMove}
                        />
                    ))}
                </SortableContext>
                {reminders.length === 0 && (
                    <div className="h-20 flex items-center justify-center text-gray-400 text-sm border-2 border-dashed border-gray-200 rounded-lg">
                        Arraste aqui
                    </div>
                )}
            </div>
        </div>
    );
}

// Helper for Droppable
import { useDroppable } from '@dnd-kit/core';

function Reminders() {
    const [reminders, setReminders] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [viewModal, setViewModal] = useState(null); // For viewing details
    const [editingId, setEditingId] = useState(null);
    const [formData, setFormData] = useState({
        title: '',
        startDate: '',
        description: '',
        image: null,
        status: 'PENDING'
    });
    const [activeId, setActiveId] = useState(null); // For drag overlay

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    useEffect(() => {
        const saved = localStorage.getItem('hap_reminders');
        if (saved) {
            try {
                let parsed = JSON.parse(saved);
                // Migration: Ensure status exists
                parsed = parsed.map(r => {
                    if (!r.status) {
                        return { ...r, status: r.completed ? 'COMPLETED' : 'PENDING' };
                    }
                    return r;
                });
                setReminders(parsed);
            } catch (e) {
                console.error("Failed to parse reminders", e);
            }
        }
    }, []);

    const saveReminders = (newReminders) => {
        setReminders(newReminders);
        localStorage.setItem('hap_reminders', JSON.stringify(newReminders));
    };

    const handleDragStart = (event) => {
        setActiveId(event.active.id);
    };

    const handleDragEnd = (event) => {
        const { active, over } = event;
        setActiveId(null);

        if (!over) return;

        const activeId = active.id;
        const overId = over.id;

        // Find the container (column)
        let newStatus = null;
        if (COLUMNS[overId]) {
            newStatus = overId;
        } else {
            // Dropped over another item, find its status
            const overItem = reminders.find(r => r.id === overId);
            if (overItem) newStatus = overItem.status;
        }

        if (newStatus) {
            setReminders((items) => {
                const oldIndex = items.findIndex(i => i.id === activeId);
                const updatedItems = [...items];
                updatedItems[oldIndex] = { ...updatedItems[oldIndex], status: newStatus };
                return arrayMove(updatedItems, oldIndex, oldIndex); // Just trigger update, sorting within column is complex, we just append or keep order for now
            });
            // Persist
            const updated = reminders.map(r => r.id === activeId ? { ...r, status: newStatus } : r);
            saveReminders(updated);
        }
    };

    const handleMove = (id, newStatus) => {
        const updated = reminders.map(r => r.id === id ? { ...r, status: newStatus } : r);
        saveReminders(updated);
    };

    const handleDelete = (id) => {
        if (window.confirm("Excluir este lembrete?")) {
            const updated = reminders.filter(r => r.id !== id);
            saveReminders(updated);
        }
    };

    const handleClearAll = () => {
        if (window.confirm("ATENÇÃO: Isso apagará TODOS os lembretes. Deseja continuar?")) {
            saveReminders([]);
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (editingId) {
            const updated = reminders.map(r => r.id === editingId ? { ...formData, id: editingId, updatedAt: new Date().toISOString() } : r);
            saveReminders(updated);
        } else {
            const newReminder = { ...formData, id: Date.now(), createdAt: new Date().toISOString() };
            saveReminders([...reminders, newReminder]);
        }
        closeModal();
    };

    const closeModal = () => {
        setShowModal(false);
        setEditingId(null);
        setFormData({ title: '', startDate: '', description: '', image: null, status: 'PENDING' });
    };

    const openEdit = (reminder) => {
        setEditingId(reminder.id);
        setFormData(reminder);
        setShowModal(true);
    };

    const handleImageUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setFormData({ ...formData, image: reader.result });
            };
            reader.readAsDataURL(file);
        }
    };

    // Filter reminders by status
    const getRemindersByStatus = (status) => reminders.filter(r => r.status === status);

    return (
        <div className="h-full flex flex-col bg-gray-50/50">
            {/* Header */}
            <div className="flex justify-between items-center bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-4">
                <div>
                    <h2 className="text-xl font-bold text-gray-800 flex items-center">
                        📋 Kanban Board
                        <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">v2.0</span>
                    </h2>
                    <p className="text-sm text-gray-500">Arraste os cards para mover entre as fases</p>
                </div>
                <div className="flex space-x-3">
                    <button
                        onClick={handleClearAll}
                        className="text-red-500 hover:text-red-700 font-medium text-sm px-3 py-2"
                    >
                        Limpar Tudo
                    </button>
                    <button
                        onClick={() => setShowModal(true)}
                        className="bg-[#f37021] text-white px-4 py-2 rounded-lg hover:bg-orange-600 transition-colors font-bold shadow-md flex items-center"
                    >
                        <span className="mr-2">➕</span> Novo Card
                    </button>
                </div>
            </div>

            {/* Kanban Board */}
            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
            >
                <div className="flex-1 overflow-x-auto overflow-y-hidden pb-2">
                    <div className="flex h-full space-x-4 min-w-max px-1">
                        {Object.values(COLUMNS).map(col => (
                            <KanbanColumn
                                key={col.id}
                                {...col}
                                reminders={getRemindersByStatus(col.id)}
                                onClickCard={setViewModal}
                                onDelete={handleDelete}
                                onEdit={openEdit}
                                onMove={handleMove}
                            />
                        ))}
                    </div>
                </div>
                <DragOverlay>
                    {activeId ? (
                        <div className="bg-white p-3 rounded-lg shadow-xl border border-blue-300 opacity-90 w-[280px] rotate-2 cursor-grabbing">
                            <h4 className="font-bold text-gray-800">{reminders.find(r => r.id === activeId)?.title}</h4>
                        </div>
                    ) : null}
                </DragOverlay>
            </DndContext>

            {/* Edit/Create Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-fade-in transform transition-all scale-100">
                        <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                            <h3 className="font-bold text-lg text-gray-800">{editingId ? 'Editar Card' : 'Novo Card'}</h3>
                            <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Título</label>
                                <input
                                    type="text"
                                    required
                                    value={formData.title}
                                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                    className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
                                    placeholder="Título da tarefa"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Data de Início/Prazo</label>
                                    <input
                                        type="date"
                                        value={formData.startDate}
                                        onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                                        className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Status Inicial</label>
                                    <select
                                        value={formData.status}
                                        onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                                        className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                                    >
                                        {Object.values(COLUMNS).map(col => (
                                            <option key={col.id} value={col.id}>{col.title}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                                <textarea
                                    rows="4"
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                                    placeholder="Detalhes..."
                                ></textarea>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Anexar Imagem</label>
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleImageUpload}
                                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                                />
                                {formData.image && (
                                    <div className="mt-2 h-24 w-full rounded border overflow-hidden relative group bg-gray-100">
                                        <img src={formData.image} alt="Preview" className="w-full h-full object-contain" />
                                        <button
                                            type="button"
                                            onClick={() => setFormData({ ...formData, image: null })}
                                            className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div className="pt-4 flex justify-end space-x-3">
                                <button type="button" onClick={closeModal} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg font-medium">Cancelar</button>
                                <button type="submit" className="px-6 py-2 bg-[#f37021] text-white rounded-lg hover:bg-orange-600 font-bold shadow-md transition-colors">Salvar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* View Details Modal */}
            {viewModal && (
                <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setViewModal(null)}>
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden animate-scale-in" onClick={e => e.stopPropagation()}>
                        <div className={`px-6 py-4 border-b border-gray-200 flex justify-between items-center ${COLUMNS[viewModal.status]?.headerColor}`}>
                            <div className="flex items-center space-x-3">
                                <h3 className="font-bold text-xl text-gray-800">{viewModal.title}</h3>
                                <span className={`text-xs px-2 py-1 rounded-full font-bold bg-white/50 border border-black/10`}>
                                    {COLUMNS[viewModal.status]?.title}
                                </span>
                            </div>
                            <button onClick={() => setViewModal(null)} className="text-gray-500 hover:text-gray-800 text-2xl">✕</button>
                        </div>

                        <div className="p-6 overflow-y-auto max-h-[80vh]">
                            {viewModal.startDate && (
                                <div className="flex items-center text-gray-600 mb-4">
                                    <span className="mr-2">📅</span>
                                    <span className="font-medium">Data: {new Date(viewModal.startDate).toLocaleDateString()}</span>
                                </div>
                            )}

                            {viewModal.image && (
                                <div className="mb-6 rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
                                    <img src={viewModal.image} alt="Anexo" className="w-full h-auto max-h-[400px] object-contain" />
                                </div>
                            )}

                            <div className="prose max-w-none text-gray-700 whitespace-pre-wrap bg-gray-50 p-4 rounded-lg border border-gray-100">
                                {viewModal.description || <span className="italic text-gray-400">Sem descrição.</span>}
                            </div>
                        </div>

                        <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex justify-between items-center">
                            <div className="text-xs text-gray-400">
                                Criado em: {new Date(viewModal.createdAt || Date.now()).toLocaleString()}
                            </div>
                            <div className="flex space-x-3">
                                <button
                                    onClick={() => { openEdit(viewModal); setViewModal(null); }}
                                    className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 font-medium"
                                >
                                    Editar
                                </button>
                                <button
                                    onClick={() => { handleDelete(viewModal.id); setViewModal(null); }}
                                    className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 font-medium"
                                >
                                    Excluir
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Reminders;
