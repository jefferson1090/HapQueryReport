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
import { useDroppable } from '@dnd-kit/core';

const COLUMNS = {
    PENDING: { id: 'PENDING', title: 'Pendente', color: 'bg-gray-50', headerColor: 'bg-gray-100', borderColor: 'border-gray-200', textColor: 'text-gray-800' },
    IN_PROGRESS: { id: 'IN_PROGRESS', title: 'Em Andamento', color: 'bg-blue-50', headerColor: 'bg-blue-100', borderColor: 'border-blue-200', textColor: 'text-blue-800' },
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

            {reminder.endDate && (
                <p className="text-xs text-gray-500 mb-2">🏁 {new Date(reminder.endDate).toLocaleDateString()}</p>
            )}

            {reminder.attachments && reminder.attachments.length > 0 && (
                <div className="flex items-center space-x-1 mb-2">
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded flex items-center">
                        📎 {reminder.attachments.length} anexo(s)
                    </span>
                </div>
            )}

            {/* Legacy Image Support */}
            {reminder.image && (!reminder.attachments || reminder.attachments.length === 0) && (
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

function Reminders() {
    const [reminders, setReminders] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [viewModal, setViewModal] = useState(null); // For viewing details
    const [editingId, setEditingId] = useState(null);
    const [formData, setFormData] = useState({
        title: '',
        startDate: '',
        endDate: '',
        description: '',
        image: null, // Legacy
        attachments: [],
        status: 'PENDING'
    });
    const [activeId, setActiveId] = useState(null); // For drag overlay

    // Carousel & Lightbox State
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    const [showLightbox, setShowLightbox] = useState(false);
    const [viewMode, setViewMode] = useState('carousel'); // 'carousel' | 'grid'

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
        setFormData({ title: '', startDate: '', endDate: '', description: '', image: null, attachments: [], status: 'PENDING' });
    };

    const openEdit = (reminder) => {
        setEditingId(reminder.id);
        setFormData(reminder);
        setShowModal(true);
    };

    // Explicitly reset state when opening "New Card"
    const openNewCard = () => {
        setEditingId(null);
        setFormData({ title: '', startDate: '', endDate: '', description: '', image: null, attachments: [], status: 'PENDING' });
        setShowModal(true);
    };

    const handleFileUpload = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        const newAttachments = [...(formData.attachments || [])];

        for (const file of files) {
            if (file.size > 5 * 1024 * 1024) {
                alert(`O arquivo ${file.name} excede o limite de 5MB.`);
                continue;
            }

            const uploadData = new FormData();
            uploadData.append('file', file);

            try {
                const res = await fetch('http://localhost:3001/api/upload/attachment', {
                    method: 'POST',
                    body: uploadData
                });
                const data = await res.json();
                if (data.error) throw new Error(data.error);

                newAttachments.push({
                    name: data.filename,
                    url: `http://localhost:3001${data.url}`,
                    type: file.type
                });
            } catch (err) {
                console.error("Upload failed", err);
                alert(`Falha ao enviar ${file.name}: ${err.message}`);
            }
        }

        setFormData(prev => ({ ...prev, attachments: newAttachments }));
    };

    const removeAttachment = (index) => {
        const newAttachments = [...formData.attachments];
        newAttachments.splice(index, 1);
        setFormData({ ...formData, attachments: newAttachments });
    };

    // Filter reminders by status
    const getRemindersByStatus = (status) => reminders.filter(r => r.status === status);

    // Carousel Logic
    const getImages = (reminder) => {
        if (!reminder) return [];
        const atts = (reminder.attachments || []).filter(a => a.type && a.type.startsWith('image/'));
        if (reminder.image && (!atts || atts.length === 0)) return [{ url: reminder.image, name: 'Cover' }]; // Legacy fallback
        return atts;
    };

    const images = viewModal ? getImages(viewModal) : [];
    const hasImages = images.length > 0;

    const nextImage = (e) => {
        e.stopPropagation();
        setCurrentImageIndex((prev) => (prev + 1) % images.length);
    };

    const prevImage = (e) => {
        e.stopPropagation();
        setCurrentImageIndex((prev) => (prev - 1 + images.length) % images.length);
    };

    return (
        <div className="h-full flex flex-col bg-gray-50/50">
            {/* Header */}
            <div className="flex justify-between items-center bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-4">
                <div>
                    <h2 className="text-xl font-bold text-gray-800 flex items-center">
                        📋 Kanban Board
                        <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">v2.2</span>
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
                        onClick={openNewCard}
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
                                onClickCard={(r) => { setViewModal(r); setCurrentImageIndex(0); setViewMode('carousel'); }}
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

            {/* Edit/Create Modal - FIXED LAYOUT */}
            {showModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg h-[90vh] flex flex-col overflow-hidden animate-fade-in">
                        {/* Fixed Header */}
                        <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex justify-between items-center flex-shrink-0">
                            <h3 className="font-bold text-lg text-gray-800">{editingId ? 'Editar Card' : 'Novo Card'}</h3>
                            <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
                        </div>

                        {/* Scrollable Body */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Título</label>
                                <input
                                    type="text"
                                    required
                                    autoFocus
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
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Data de Término</label>
                                    <input
                                        type="date"
                                        value={formData.endDate || ''}
                                        onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                                        className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
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
                                <label className="block text-sm font-medium text-gray-700 mb-1">Anexar Arquivos (Máx 5MB)</label>
                                <input
                                    type="file"
                                    multiple
                                    onChange={handleFileUpload}
                                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                                />
                                {formData.attachments && formData.attachments.length > 0 && (
                                    <div className="mt-2 space-y-2">
                                        {formData.attachments.map((att, idx) => (
                                            <div key={idx} className="flex items-center justify-between bg-gray-50 p-2 rounded border">
                                                <div className="flex items-center space-x-2 truncate">
                                                    <span className="text-lg">{att.type && att.type.startsWith('image/') ? '🖼️' : '📄'}</span>
                                                    <a href={att.url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline truncate max-w-[200px]">{att.name}</a>
                                                </div>
                                                <button type="button" onClick={() => removeAttachment(idx)} className="text-red-500 hover:text-red-700">✕</button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Fixed Footer */}
                        <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex justify-end space-x-3 flex-shrink-0">
                            <button type="button" onClick={closeModal} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg font-medium">Cancelar</button>
                            <button onClick={handleSubmit} className="px-6 py-2 bg-[#f37021] text-white rounded-lg hover:bg-orange-600 font-bold shadow-md transition-colors">Salvar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* View Details Modal - CAROUSEL & LIGHTBOX */}
            {viewModal && (
                <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setViewModal(null)}>
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-scale-in" onClick={e => e.stopPropagation()}>
                        <div className={`px-6 py-4 border-b border-gray-200 flex justify-between items-center ${COLUMNS[viewModal.status]?.headerColor} flex-shrink-0`}>
                            <div className="flex items-center space-x-3">
                                <h3 className="font-bold text-xl text-gray-800">{viewModal.title}</h3>
                                <span className={`text-xs px-2 py-1 rounded-full font-bold bg-white/50 border border-black/10`}>
                                    {COLUMNS[viewModal.status]?.title}
                                </span>
                            </div>
                            <div className="flex items-center space-x-2">
                                {hasImages && (
                                    <button
                                        onClick={() => setViewMode(viewMode === 'carousel' ? 'grid' : 'carousel')}
                                        className="text-xs bg-white/50 hover:bg-white/80 px-2 py-1 rounded border border-black/10 transition-colors"
                                        title="Mudar Visualização"
                                    >
                                        {viewMode === 'carousel' ? '🔲 Grade' : '🖼️ Slide'}
                                    </button>
                                )}
                                <button onClick={() => setViewModal(null)} className="text-gray-500 hover:text-gray-800 text-2xl">✕</button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6">
                            {viewModal.startDate && (
                                <div className="flex items-center text-gray-600 mb-4">
                                    <span className="mr-2">📅</span>
                                    <span className="font-medium">Data: {new Date(viewModal.startDate).toLocaleDateString()}</span>
                                </div>
                            )}

                            {viewModal.endDate && (
                                <div className="flex items-center text-gray-600 mb-4">
                                    <span className="mr-2">🏁</span>
                                    <span className="font-medium">Término: {new Date(viewModal.endDate).toLocaleDateString()}</span>
                                </div>
                            )}

                            {/* CAROUSEL VIEW */}
                            {hasImages && viewMode === 'carousel' && (
                                <div className="mb-6 relative group bg-black/5 rounded-lg overflow-hidden border border-gray-200">
                                    <div className="h-[300px] flex items-center justify-center bg-gray-100 cursor-zoom-in" onClick={() => setShowLightbox(true)}>
                                        <img
                                            src={images[currentImageIndex].url}
                                            alt="Slide"
                                            className="max-h-full max-w-full object-contain"
                                        />
                                    </div>

                                    {images.length > 1 && (
                                        <>
                                            <button onClick={prevImage} className="absolute left-2 top-1/2 transform -translate-y-1/2 bg-black/50 text-white p-2 rounded-full hover:bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity">
                                                ◀
                                            </button>
                                            <button onClick={nextImage} className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-black/50 text-white p-2 rounded-full hover:bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity">
                                                ▶
                                            </button>
                                            <div className="absolute bottom-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded-full">
                                                {currentImageIndex + 1} / {images.length}
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}

                            {/* GRID VIEW */}
                            {hasImages && viewMode === 'grid' && (
                                <div className="mb-6 space-y-2">
                                    <h4 className="font-bold text-gray-700 text-sm">Imagens:</h4>
                                    <div className="grid grid-cols-2 gap-2">
                                        {images.map((img, idx) => (
                                            <div key={idx} className="border rounded p-2 flex flex-col items-center bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer" onClick={() => { setCurrentImageIndex(idx); setShowLightbox(true); }}>
                                                <img src={img.url} alt={img.name} className="h-32 object-contain mb-2" />
                                                <span className="text-xs text-gray-500 truncate w-full text-center">{img.name}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Non-Image Attachments */}
                            {viewModal.attachments && viewModal.attachments.some(a => !a.type?.startsWith('image/')) && (
                                <div className="mb-6 space-y-2">
                                    <h4 className="font-bold text-gray-700 text-sm">Outros Anexos:</h4>
                                    <div className="grid grid-cols-2 gap-2">
                                        {viewModal.attachments.filter(a => !a.type?.startsWith('image/')).map((att, idx) => (
                                            <div key={idx} className="border rounded p-2 flex flex-col items-center bg-gray-50 hover:bg-gray-100 transition-colors">
                                                <div className="h-12 flex items-center justify-center text-2xl">📄</div>
                                                <a href={att.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline text-center w-full truncate" title={att.name}>
                                                    {att.name}
                                                </a>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="prose max-w-none text-gray-700 whitespace-pre-wrap bg-gray-50 p-4 rounded-lg border border-gray-100">
                                {viewModal.description || <span className="italic text-gray-400">Sem descrição.</span>}
                            </div>
                        </div>

                        <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex justify-between items-center flex-shrink-0">
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

            {/* LIGHTBOX */}
            {showLightbox && viewModal && hasImages && (
                <div className="fixed inset-0 bg-black/95 z-[60] flex items-center justify-center p-4 animate-fade-in" onClick={() => setShowLightbox(false)}>
                    <button onClick={() => setShowLightbox(false)} className="absolute top-4 right-4 text-white text-4xl hover:text-gray-300">✕</button>

                    <img
                        src={images[currentImageIndex].url}
                        alt="Full Screen"
                        className="max-h-[90vh] max-w-[90vw] object-contain shadow-2xl"
                        onClick={e => e.stopPropagation()} // Prevent closing when clicking image
                    />

                    {images.length > 1 && (
                        <>
                            <button onClick={prevImage} className="absolute left-4 top-1/2 transform -translate-y-1/2 text-white text-6xl hover:text-gray-300">
                                ‹
                            </button>
                            <button onClick={nextImage} className="absolute right-4 top-1/2 transform -translate-y-1/2 text-white text-6xl hover:text-gray-300">
                                ›
                            </button>
                            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 text-white text-sm bg-black/50 px-3 py-1 rounded-full">
                                {currentImageIndex + 1} / {images.length}
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

export default Reminders;
