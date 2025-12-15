import React, { createContext, useContext, useState, useEffect } from 'react';
import { getApiUrl } from '../config';

const ApiContext = createContext();

export const ApiProvider = ({ children }) => {
    const [apiUrl, setApiUrl] = useState('http://localhost:3001');
    const [isReady, setIsReady] = useState(false);

    useEffect(() => {
        const init = async () => {
            const url = await getApiUrl();
            setApiUrl(url);
            setIsReady(true);
        };
        init();
    }, []);

    return (
        <ApiContext.Provider value={{ apiUrl, isReady }}>
            {children}
        </ApiContext.Provider>
    );
};

export const useApi = () => useContext(ApiContext);
