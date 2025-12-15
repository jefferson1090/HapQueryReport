import React from 'react';
import { Users, Hash, Lock, Search, MoreVertical } from 'lucide-react';

const UserItem = ({ user, isSelected, unreadCount, onClick }) => (
    <div
        onClick={onClick}
        className={`flex items-center p-2 rounded-lg cursor-pointer mb-1 transition-all
            ${isSelected ? 'bg-blue-50 text-blue-900 shadow-sm' : 'hover:bg-gray-100 text-gray-700'}
        `}
    >
        <div className="relative">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ring-2 ring-white
                ${isSelected ? 'bg-blue-200 text-blue-700' : 'bg-gray-200 text-gray-500'}
            `}>
                {user.username.charAt(0).toUpperCase()}
            </div>
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-white rounded-full"></span>
        </div>

        <div className="ml-3 flex-1 overflow-hidden">
            <div className="flex justify-between items-baseline">
                <span className={`text-sm font-medium truncate ${isSelected ? 'font-bold' : ''}`}>
                    {user.username}
                </span>
                {unreadCount > 0 && (
                    <span className="bg-red-500 text-white text-[10px] px-1.5 rounded-full font-bold shadow-sm animate-pulse">
                        {unreadCount}
                    </span>
                )}
            </div>
            <span className={`text-[10px] truncate block ${isSelected ? 'text-blue-400' : 'text-gray-400'}`}>
                {user.team}
            </span>
        </div>
    </div>
);

const ChatSidebar = ({ users, currentUser, selectedUser, unreadCounts, onSelectUser }) => {
    const generalChat = { username: 'Chat Geral', team: 'Todos' };

    // Group users by team/department logic could go here

    return (
        <div className="w-64 bg-white border-r border-gray-200 flex flex-col h-full flex-shrink-0">
            {/* Header */}
            <div className="p-4 border-b border-gray-100 flex justify-between items-center">
                <h2 className="font-bold text-lg text-gray-800">Mensagens</h2>
                <button className="text-gray-400 hover:text-gray-600"><MoreVertical size={18} /></button>
            </div>

            {/* Search */}
            <div className="px-4 py-2">
                <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    <input
                        className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-9 pr-3 py-1.5 text-xs focus:ring-2 focus:ring-blue-100 outline-none transition-shadow"
                        placeholder="Buscar contatos..."
                    />
                </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-2 scrollbar-thin">
                <div className="mb-4">
                    <span className="text-xs font-bold text-gray-400 uppercase px-2 mb-2 block tracking-wider">Canais</span>
                    <div
                        onClick={() => onSelectUser(null)}
                        className={`flex items-center p-2 rounded-lg cursor-pointer transition-colors ${!selectedUser ? 'bg-blue-50 text-blue-900 font-bold' : 'hover:bg-gray-100 text-gray-600'}`}
                    >
                        <Hash size={18} className="mr-3 ml-1" />
                        <span className="text-sm">Geral</span>
                    </div>
                </div>

                <div>
                    <span className="text-xs font-bold text-gray-400 uppercase px-2 mb-2 block tracking-wider">Diretas ({users.length - 1})</span>
                    {users.filter(u => u.username !== currentUser.username).map(u => (
                        <UserItem
                            key={u.username}
                            user={u}
                            isSelected={selectedUser?.username === u.username}
                            unreadCount={unreadCounts[u.username] || 0}
                            onClick={() => onSelectUser(u)}
                        />
                    ))}
                </div>
            </div>

            {/* User Profile Footer */}
            <div className="p-3 border-t border-gray-100 bg-gray-50 flex items-center">
                <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-xs ring-2 ring-white shadow-sm">
                    {currentUser.username.charAt(0).toUpperCase()}
                </div>
                <div className="ml-2">
                    <p className="text-xs font-bold text-gray-700">{currentUser.username}</p>
                    <div className="flex items-center text-[10px] text-green-600">
                        <span className="w-1.5 h-1.5 bg-green-500 rounded-full mr-1"></span>
                        Online
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ChatSidebar;
