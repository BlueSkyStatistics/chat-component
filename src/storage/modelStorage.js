// Interface for model storage
export class ModelStorageInterface {
    async getModels() {
        throw new Error('Not implemented');
    }

    async saveModels(models) {
        throw new Error('Not implemented');
    }

    async getSelectedModel() {
        throw new Error('Not implemented');
    }

    async saveSelectedModel(modelName) {
        throw new Error('Not implemented');
    }

    async getCredentials() {
        throw new Error('Not implemented');
    }

    async saveCredentials(credentials) {
        throw new Error('Not implemented');
    }
}

// Local Storage Implementation
export class LocalStorageProvider extends ModelStorageInterface {
    async getModels() {
        const savedModels = localStorage.getItem('aiModels');
        return savedModels ? JSON.parse(savedModels) : [];
    }

    async saveModels(models) {
        localStorage.setItem('aiModels', JSON.stringify(models));
    }

    async getSelectedModel() {
        return localStorage.getItem('selectedModel');
    }

    async saveSelectedModel(modelName) {
        localStorage.setItem('selectedModel', modelName);
    }

    async getCredentials() {
        const savedCredentials = localStorage.getItem('aiModelCredentials');
        return savedCredentials ? JSON.parse(savedCredentials) : [];
    }

    async saveCredentials(credentials) {
        localStorage.setItem('aiModelCredentials', JSON.stringify(credentials));
    }
}

