import React, {useMemo, useState} from 'react'
import {
    createCredentialId,
    createModelId,
    getCredentialLabel,
    OPENAI_MODEL_LIST_URL,
    parseModelNames,
} from './utils/modelConfig'
import {credentialHasModelList, listCredentialModels} from './utils/providers/modelListing'

const createCredentialForm = (provider = 'openai') => {
    if (provider === 'azure') {
        return {
            provider,
            label: '',
            clientId: '',
            tenantId: '',
            resourceName: '',
            chatScopes: 'https://cognitiveservices.azure.com/.default',
            apiVersion: '2025-04-01-preview',
            modelListEnabled: false,
            modelListUrl: '',
            modelListScopes: 'https://management.azure.com/.default',
        }
    }
    if (provider === 'manual') {
        return {
            provider,
            label: '',
            endpoint: '',
            apiKey: '',
            modelListEnabled: false,
            modelListUrl: '',
        }
    }
    return {
        provider: 'openai',
        label: '',
        apiKey: '',
        modelListEnabled: true,
        modelListUrl: OPENAI_MODEL_LIST_URL,
    }
}

const field = (form, setForm, name, label, options = {}) => {
    const fieldId = `credential-${name}`
    return (
    <div key={name}>
        <label className="form-label small mb-1" htmlFor={fieldId}>{label}</label>
        <input
            id={fieldId}
            type={options.type || 'text'}
            className="form-control"
            placeholder={options.placeholder}
            value={form[name] || ''}
            onChange={(event) => setForm({...form, [name]: event.target.value})}
        />
    </div>
    )
}

function Settings({models, credentials, onSave, onClose, addModelFormVisible}) {
    const [credentialProvider, setCredentialProvider] = useState('openai')
    const [credentialForm, setCredentialForm] = useState(() => createCredentialForm())
    const [editingCredentialId, setEditingCredentialId] = useState(null)
    const [modelNames, setModelNames] = useState('')
    const [modelCredentialId, setModelCredentialId] = useState('')
    const [listedModels, setListedModels] = useState([])
    const [isListingModels, setIsListingModels] = useState(false)
    const [listError, setListError] = useState('')
    const [formError, setFormError] = useState('')
    const [activeTab, setActiveTab] = useState('models')
    const [expandedGroups, setExpandedGroups] = useState(new Set())

    const credentialsById = useMemo(
        () => new Map(credentials.map((credential) => [credential.id, credential])),
        [credentials]
    )
    const modelGroups = useMemo(() => {
        const groups = new Map(credentials.map((credential) => [credential.id, {
            credential,
            models: [],
        }]))
        const unassigned = {credential: null, models: []}
        models.forEach((model) => {
            const group = groups.get(model.credentialId) || unassigned
            group.models.push(model)
        })
        return [...groups.values(), ...(unassigned.models.length ? [unassigned] : [])]
    }, [credentials, models])

    const selectedCredential = credentialsById.get(modelCredentialId)
    const getVisibleCredentialLabel = (credential) => credential?.restricted
        ? credential.label?.trim() || 'Managed credentials'
        : getCredentialLabel(credential)
    const toggleGroup = (credentialId) => {
        setExpandedGroups((previous) => {
            const next = new Set(previous)
            if (next.has(credentialId)) next.delete(credentialId)
            else next.add(credentialId)
            return next
        })
    }

    const changeProvider = (provider) => {
        setCredentialProvider(provider)
        setCredentialForm(createCredentialForm(provider))
        setEditingCredentialId(null)
        setFormError('')
    }

    const persist = async (nextModels, nextCredentials) => {
        setFormError('')
        try {
            await onSave(nextModels, nextCredentials)
            return true
        } catch (error) {
            setFormError(error.message || 'Could not save model settings.')
            return false
        }
    }

    const validateCredential = (credential) => {
        if (credential.provider === 'openai' && !credential.apiKey.trim()) {
            return 'OpenAI credentials require an API key.'
        }
        if (credential.provider === 'azure') {
            if (!credential.clientId.trim() || !credential.tenantId.trim() || !credential.resourceName.trim()) {
                return 'Azure credentials require client ID, tenant ID, and resource name.'
            }
            if (!credential.chatScopes.trim() || !credential.apiVersion.trim()) {
                return 'Azure credentials require chat scopes and an API version.'
            }
            if (credential.modelListEnabled && (!credential.modelListUrl.trim() || !credential.modelListScopes.trim())) {
                return 'Enabled Azure deployment listing requires a URL and scopes.'
            }
        }
        if (credential.provider === 'manual' && !credential.endpoint.trim()) {
            return 'Manual credentials require an endpoint URL.'
        }
        if (credential.provider === 'manual' && credential.modelListEnabled && !credential.modelListUrl.trim()) {
            return 'Enabled manual model listing requires a URL.'
        }
        return ''
    }

    const handleSaveCredential = async () => {
        const error = validateCredential(credentialForm)
        if (error) {
            setFormError(error)
            return
        }
        const credential = {
            ...credentialForm,
            id: editingCredentialId || createCredentialId(),
            label: credentialForm.label.trim(),
        }
        const nextCredentials = editingCredentialId
            ? credentials.map((item) => item.id === editingCredentialId ? credential : item)
            : [...credentials, credential]
        if (await persist(models, nextCredentials)) {
            setCredentialForm(createCredentialForm(credentialProvider))
            setEditingCredentialId(null)
        }
    }

    const handleEditCredential = (credential) => {
        if (credential.restricted) return
        setActiveTab('credentials')
        setCredentialProvider(credential.provider)
        setCredentialForm({...createCredentialForm(credential.provider), ...credential})
        setEditingCredentialId(credential.id)
        setFormError('')
    }

    const handleDeleteCredential = async (credentialId) => {
        if (credentialsById.get(credentialId)?.restricted) return
        const nextCredentials = credentials.filter((credential) => credential.id !== credentialId)
        const nextModels = models.filter((model) => model.credentialId !== credentialId)
        if (await persist(nextModels, nextCredentials) && modelCredentialId === credentialId) {
            setModelCredentialId('')
            setListedModels([])
        }
    }

    const handleRemoveModel = async (modelId) => {
        const model = models.find((item) => item.id === modelId)
        if (credentialsById.get(model?.credentialId)?.restricted) return
        await persist(models.filter((model) => model.id !== modelId), credentials)
    }

    const handleListModels = async () => {
        if (!selectedCredential) return
        setListError('')
        setIsListingModels(true)
        try {
            setListedModels(await listCredentialModels(selectedCredential))
        } catch (error) {
            setListedModels([])
            setListError(error.message || 'Could not list models.')
        } finally {
            setIsListingModels(false)
        }
    }

    const appendListedModels = (event) => {
        const selectedNames = Array.from(event.target.selectedOptions, (option) => option.value)
        setModelNames([...new Set([...parseModelNames(modelNames), ...selectedNames])].join(', '))
    }

    const handleAddModels = async () => {
        const names = parseModelNames(modelNames)
        if (!modelCredentialId || !names.length) {
            setFormError('Select credentials and enter at least one model name.')
            return
        }
        if (selectedCredential?.restricted) {
            setFormError('Restricted credentials cannot be used to add models.')
            return
        }
        const existingNames = new Set(
            models
                .filter((model) => model.credentialId === modelCredentialId)
                .map((model) => model.name)
        )
        const modelsToAdd = names
            .filter((name) => !existingNames.has(name))
            .map((name) => ({
                id: createModelId(),
                name,
                credentialId: modelCredentialId,
                external: false,
            }))
        if (!modelsToAdd.length) {
            setFormError('Those models are already configured for the selected credentials.')
            return
        }
        if (await persist([...models, ...modelsToAdd], credentials)) {
            setModelNames('')
            setListedModels([])
            setFormError('')
        }
    }

    return (
        <>
            <div className="modal-backdrop fade show" style={{zIndex: 1040}}></div>
            <div className="modal d-block" tabIndex="-1" style={{zIndex: 1050}}>
                <div className="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-lg">
                    <div className="modal-content">
                        <div className="modal-header">
                            <h5 className="modal-title">AI Model Settings</h5>
                            <button type="button" className="btn-close" onClick={onClose} aria-label="Close"></button>
                        </div>
                        <div className="modal-body">
                            {formError && <div className="alert alert-danger py-2 small">{formError}</div>}
                            <ul className="nav nav-tabs mb-4">
                                <li className="nav-item">
                                    <button
                                        type="button"
                                        className={`nav-link ${activeTab === 'models' ? 'active' : ''}`}
                                        onClick={() => setActiveTab('models')}
                                    >
                                        Models
                                    </button>
                                </li>
                                {addModelFormVisible && (
                                    <li className="nav-item">
                                        <button
                                            type="button"
                                            className={`nav-link ${activeTab === 'credentials' ? 'active' : ''}`}
                                            onClick={() => setActiveTab('credentials')}
                                        >
                                            Credentials
                                        </button>
                                    </li>
                                )}
                            </ul>

                            {activeTab === 'models' && <section className="mb-4">
                                <h6 className="mb-3">Configured Models</h6>
                                {models.length === 0 ? (
                                    <p className="text-muted small">No models configured yet.</p>
                                ) : (
                                    <div className="d-flex flex-column gap-3">
                                        {modelGroups.map(({credential, models: groupedModels}) => (
                                            <div key={credential?.id || 'unassigned'} className="card">
                                                <div className="card-header d-flex justify-content-between align-items-center">
                                                    <button
                                                        type="button"
                                                        className="btn btn-link text-decoration-none text-reset p-0 flex-grow-1 text-start"
                                                        onClick={() => toggleGroup(credential?.id || 'unassigned')}
                                                        aria-expanded={expandedGroups.has(credential?.id || 'unassigned')}
                                                    >
                                                        <i className={`fas fa-chevron-${expandedGroups.has(credential?.id || 'unassigned') ? 'down' : 'right'} me-2`}></i>
                                                        <span className="fw-semibold">{getVisibleCredentialLabel(credential)}</span>
                                                        {credential && !credential.restricted && (
                                                            <span className="badge text-bg-secondary ms-2">{credential.provider}</span>
                                                        )}
                                                        <span className="badge text-bg-light border text-dark ms-2">
                                                            {groupedModels.length} {groupedModels.length === 1 ? 'model' : 'models'}
                                                        </span>
                                                    </button>
                                                    {credential?.restricted && <i className="fas fa-lock text-muted me-2" title="Restricted credentials"></i>}
                                                    {addModelFormVisible && credential && !credential.external && !credential.restricted && (
                                                        <span className="btn-group">
                                                            <button className="btn btn-outline-secondary btn-sm" onClick={() => handleEditCredential(credential)}>
                                                                <i className="fas fa-edit"></i>
                                                            </button>
                                                            <button className="btn btn-outline-danger btn-sm" onClick={() => handleDeleteCredential(credential.id)}>
                                                                <i className="fas fa-trash-alt"></i>
                                                            </button>
                                                        </span>
                                                    )}
                                                </div>
                                                {expandedGroups.has(credential?.id || 'unassigned') && (
                                                    <ul className="list-group list-group-flush">
                                                        {groupedModels.map((model) => (
                                                            <li key={model.id || model.name} className="list-group-item d-flex justify-content-between align-items-center">
                                                                <span>{model.name}</span>
                                                                {addModelFormVisible && !model.external && !credentialsById.get(model.credentialId)?.restricted && (
                                                                    <button onClick={() => handleRemoveModel(model.id)} className="btn btn-danger btn-sm">
                                                                        <i className="fas fa-trash-alt"></i>
                                                                    </button>
                                                                )}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </section>}

                            {addModelFormVisible && activeTab === 'credentials' && (
                                    <section>
                                        <h6 className="mb-3">{editingCredentialId ? 'Edit Credentials' : 'Add Credentials'}</h6>
                                        <div className="btn-group mb-3" role="group" aria-label="Credential provider">
                                            {['openai', 'azure', 'manual'].map((provider) => (
                                                <button
                                                    key={provider}
                                                    type="button"
                                                    className={`btn btn-outline-primary ${credentialProvider === provider ? 'active' : ''}`}
                                                    onClick={() => changeProvider(provider)}
                                                >
                                                    {provider === 'openai' ? 'OpenAI' : provider === 'azure' ? 'Azure' : 'Manual'}
                                                </button>
                                            ))}
                                        </div>
                                        <div className="d-flex flex-column gap-3">
                                            {field(credentialForm, setCredentialForm, 'label', 'Credential label (optional)', {placeholder: 'e.g. Work OpenAI'})}
                                            {credentialProvider === 'openai' && (
                                                <>
                                                    {field(credentialForm, setCredentialForm, 'apiKey', 'API key', {type: 'password'})}
                                                    {field(credentialForm, setCredentialForm, 'modelListUrl', 'Model list URL')}
                                                </>
                                            )}
                                            {credentialProvider === 'azure' && (
                                                <>
                                                    {field(credentialForm, setCredentialForm, 'clientId', 'Client ID')}
                                                    {field(credentialForm, setCredentialForm, 'tenantId', 'Tenant ID')}
                                                    {field(credentialForm, setCredentialForm, 'resourceName', 'Azure OpenAI resource name')}
                                                    {field(credentialForm, setCredentialForm, 'chatScopes', 'Chat scopes (comma-separated)')}
                                                    {field(credentialForm, setCredentialForm, 'apiVersion', 'Chat API version')}
                                                    {field(credentialForm, setCredentialForm, 'modelListUrl', 'Deployment list URL')}
                                                    {field(credentialForm, setCredentialForm, 'modelListScopes', 'Deployment list scopes (comma-separated)')}
                                                </>
                                            )}
                                            {credentialProvider === 'manual' && (
                                                <>
                                                    {field(credentialForm, setCredentialForm, 'endpoint', 'Chat completion endpoint URL')}
                                                    {field(credentialForm, setCredentialForm, 'apiKey', 'API key (optional)', {type: 'password'})}
                                                    {field(credentialForm, setCredentialForm, 'modelListUrl', 'Model list URL (optional)')}
                                                </>
                                            )}
                                            <div className="form-check">
                                                <input
                                                    id="modelListEnabled"
                                                    className="form-check-input"
                                                    type="checkbox"
                                                    checked={credentialForm.modelListEnabled}
                                                    onChange={(event) => setCredentialForm({...credentialForm, modelListEnabled: event.target.checked})}
                                                />
                                                <label className="form-check-label" htmlFor="modelListEnabled">Enable model listing</label>
                                            </div>
                                            <button type="button" onClick={handleSaveCredential} className="btn btn-primary align-self-start">
                                                <i className={`fas fa-${editingCredentialId ? 'save' : 'plus'} me-2`}></i>
                                                {editingCredentialId ? 'Save Credentials' : 'Add Credentials'}
                                            </button>
                                        </div>
                                    </section>
                            )}

                            {addModelFormVisible && activeTab === 'models' && (
                                    <section className="border-top pt-3">
                                        <h6 className="mb-3">Add Models</h6>
                                        <div className="d-flex flex-column gap-3">
                                            <div>
                                                <label className="form-label small mb-1">Credentials</label>
                                                <select
                                                    className="form-select"
                                                    value={modelCredentialId}
                                                    onChange={(event) => {
                                                        setModelCredentialId(event.target.value)
                                                        setListedModels([])
                                                        setListError('')
                                                    }}
                                                >
                                                    <option value="">Select credentials</option>
                                                    {credentials.filter((credential) => !credential.restricted).map((credential) => (
                                                        <option key={credential.id} value={credential.id}>
                                                            {getCredentialLabel(credential)} ({credential.provider})
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="form-label small mb-1">Model names</label>
                                                <input
                                                    type="text"
                                                    className="form-control"
                                                    placeholder="gpt-4o, gpt-4o-mini"
                                                    value={modelNames}
                                                    onChange={(event) => setModelNames(event.target.value)}
                                                />
                                                <div className="form-text">Use comma-separated names. You can edit names selected from the list.</div>
                                            </div>
                                            {credentialHasModelList(selectedCredential) && (
                                                <div>
                                                    <button type="button" className="btn btn-outline-primary btn-sm" onClick={handleListModels} disabled={isListingModels}>
                                                        <i className="fas fa-list me-2"></i>
                                                        {isListingModels ? 'Listing models…' : 'List models'}
                                                    </button>
                                                    {listError && <div className="text-danger small mt-2">{listError}</div>}
                                                    {listedModels.length > 0 && (
                                                        <select className="form-select mt-2" multiple size="8" onChange={appendListedModels}>
                                                            {listedModels.map((name) => <option key={name} value={name}>{name}</option>)}
                                                        </select>
                                                    )}
                                                </div>
                                            )}
                                            <button type="button" onClick={handleAddModels} className="btn btn-primary align-self-start" disabled={!modelCredentialId}>
                                                <i className="fas fa-plus me-2"></i>Add Models
                                            </button>
                                        </div>
                                    </section>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </>
    )
}

export default Settings
