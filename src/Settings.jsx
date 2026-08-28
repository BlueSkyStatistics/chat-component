import React, {useMemo, useState} from 'react'
import {
    createCredentialId,
    createModelId,
    getCredentialLabel,
    OPENAI_MODEL_LIST_URL,
    parseModelNames,
} from './utils/modelConfig'
import {listCredentialModels} from './utils/providers/modelListing'
import CredentialFormSection from './settings/CredentialFormSection'
import CredentialGroupCard from './settings/CredentialGroupCard'

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


function Settings({models, credentials, onSave, onClose, addModelFormVisible}) {
    const [credentialProvider, setCredentialProvider] = useState('openai')
    const [credentialForm, setCredentialForm] = useState(() => createCredentialForm())
    const [editingCredentialId, setEditingCredentialId] = useState(null)
    const [showCredentialForm, setShowCredentialForm] = useState(false)
    const [draftModelsByCredential, setDraftModelsByCredential] = useState({})
    const [listedModelsByCredential, setListedModelsByCredential] = useState({})
    const [listingCredentialId, setListingCredentialId] = useState(null)
    const [listErrorByCredential, setListErrorByCredential] = useState({})
    const [formError, setFormError] = useState('')
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
            setShowCredentialForm(false)
        }
    }

    const handleEditCredential = (credential) => {
        if (credential.restricted) return
        setCredentialProvider(credential.provider)
        setCredentialForm({...createCredentialForm(credential.provider), ...credential})
        setEditingCredentialId(credential.id)
        setShowCredentialForm(true)
        setFormError('')
    }

    const handleDeleteCredential = async (credentialId) => {
        if (credentialsById.get(credentialId)?.restricted) return
        if (!window.confirm('Delete these credentials and all attached models?')) return
        const nextCredentials = credentials.filter((credential) => credential.id !== credentialId)
        const nextModels = models.filter((model) => model.credentialId !== credentialId)
        if (await persist(nextModels, nextCredentials)) {
            setDraftModelsByCredential((previous) => {
                const next = {...previous}
                delete next[credentialId]
                return next
            })
            setListedModelsByCredential((previous) => {
                const next = {...previous}
                delete next[credentialId]
                return next
            })
            setListErrorByCredential((previous) => {
                const next = {...previous}
                delete next[credentialId]
                return next
            })
        }
    }

    const handleRemoveModel = async (modelId) => {
        const model = models.find((item) => item.id === modelId)
        if (credentialsById.get(model?.credentialId)?.restricted) return
        await persist(models.filter((item) => item.id !== modelId), credentials)
    }

    const handleListModels = async (credential) => {
        if (!credential) return
        setListErrorByCredential((previous) => ({...previous, [credential.id]: ''}))
        setListingCredentialId(credential.id)
        try {
            const listed = await listCredentialModels(credential)
            setListedModelsByCredential((previous) => ({...previous, [credential.id]: listed}))
        } catch (error) {
            setListedModelsByCredential((previous) => ({...previous, [credential.id]: []}))
            setListErrorByCredential((previous) => ({
                ...previous,
                [credential.id]: error.message || 'Could not list models.',
            }))
        } finally {
            setListingCredentialId(null)
        }
    }

    const appendListedModels = (credentialId, event) => {
        const selectedNames = Array.from(event.target.selectedOptions, (option) => option.value)
        setDraftModelsByCredential((previous) => {
            const current = previous[credentialId] || ''
            return {
                ...previous,
                [credentialId]: [...new Set([...parseModelNames(current), ...selectedNames])].join(', '),
            }
        })
    }

    const handleAddModels = async (credentialId) => {
        const names = parseModelNames(draftModelsByCredential[credentialId] || '')
        if (!credentialId || !names.length) {
            setFormError('Enter at least one model name.')
            return
        }
        const selectedCredential = credentialsById.get(credentialId)
        if (selectedCredential?.restricted) {
            setFormError('Restricted credentials cannot be used to add models.')
            return
        }
        const existingNames = new Set(
            models
                .filter((item) => item.credentialId === credentialId)
                .map((item) => item.name)
        )
        const modelsToAdd = names
            .filter((name) => !existingNames.has(name))
            .map((name) => ({
                id: createModelId(),
                name,
                credentialId,
                external: false,
            }))
        if (!modelsToAdd.length) {
            setFormError('Those models are already configured for the selected credentials.')
            return
        }
        if (await persist([...models, ...modelsToAdd], credentials)) {
            setDraftModelsByCredential((previous) => ({...previous, [credentialId]: ''}))
            setListedModelsByCredential((previous) => ({...previous, [credentialId]: []}))
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
                            <section className="mb-4">
                                <div className="d-flex justify-content-between align-items-center mb-3">
                                    <h6 className="mb-0">Credentials and Models</h6>
                                    {addModelFormVisible && (
                                        <button
                                            type="button"
                                            className="btn btn-primary btn-sm"
                                            onClick={() => {
                                                setCredentialProvider('openai')
                                                setCredentialForm(createCredentialForm('openai'))
                                                setEditingCredentialId(null)
                                                setShowCredentialForm((previous) => !previous)
                                                setFormError('')
                                            }}
                                        >
                                            <i className={`fas fa-${showCredentialForm ? 'times' : 'plus'} me-2`}></i>
                                            {showCredentialForm ? 'Cancel' : 'New Credentials'}
                                        </button>
                                    )}
                                </div>
                                {modelGroups.length === 0 ? (
                                    <p className="text-muted small">No credentials or models configured yet.</p>
                                ) : (
                                    <div className="d-flex flex-column gap-3">
                                        {modelGroups.map(({credential, models: groupedModels}) => (
                                            <CredentialGroupCard
                                                key={credential?.id || 'unassigned'}
                                                addModelFormVisible={addModelFormVisible}
                                                credential={credential}
                                                groupedModels={groupedModels}
                                                isExpanded={expandedGroups.has(credential?.id || 'unassigned')}
                                                isListing={listingCredentialId === credential?.id}
                                                listError={listErrorByCredential[credential?.id] || ''}
                                                draftModelNames={draftModelsByCredential[credential?.id] || ''}
                                                listedModels={listedModelsByCredential[credential?.id] || []}
                                                credentialsById={credentialsById}
                                                getVisibleCredentialLabel={getVisibleCredentialLabel}
                                                onToggle={toggleGroup}
                                                onEditCredential={handleEditCredential}
                                                onRefreshModels={handleListModels}
                                                onDeleteCredential={handleDeleteCredential}
                                                onRemoveModel={handleRemoveModel}
                                                onDraftModelsChange={(credentialId, value) => setDraftModelsByCredential((previous) => ({
                                                    ...previous,
                                                    [credentialId]: value,
                                                }))}
                                                onAddModels={handleAddModels}
                                                onAppendListedModels={appendListedModels}
                                            />
                                        ))}
                                    </div>
                                )}
                            </section>

                            {addModelFormVisible && showCredentialForm && (
                                <CredentialFormSection
                                    credentialProvider={credentialProvider}
                                    credentialForm={credentialForm}
                                    editingCredentialId={editingCredentialId}
                                    onChangeProvider={changeProvider}
                                    onFormChange={setCredentialForm}
                                    onSaveCredential={handleSaveCredential}
                                />
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </>
    )
}

export default Settings