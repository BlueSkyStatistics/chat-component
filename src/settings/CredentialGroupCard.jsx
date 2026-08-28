import React from 'react'
import {credentialHasModelList} from '../utils/providers/modelListing'

function CredentialGroupCard({
    addModelFormVisible,
    credential,
    groupedModels,
    isExpanded,
    isListing,
    listError,
    draftModelNames,
    listedModels,
    credentialsById,
    getVisibleCredentialLabel,
    onToggle,
    onEditCredential,
    onRefreshModels,
    onDeleteCredential,
    onRemoveModel,
    onDraftModelsChange,
    onAddModels,
    onAppendListedModels,
}) {
    const groupId = credential?.id || 'unassigned'
    return (
        <div className="card">
            <div className="card-header d-flex justify-content-between align-items-center">
                <button
                    type="button"
                    className="btn btn-link text-decoration-none text-reset p-0 flex-grow-1 text-start"
                    onClick={() => onToggle(groupId)}
                    aria-expanded={isExpanded}
                >
                    <i className={`fas fa-chevron-${isExpanded ? 'down' : 'right'} me-2`}></i>
                    <span className="fw-semibold">{getVisibleCredentialLabel(credential)}</span>
                    {credential && (
                        <span className="badge text-bg-secondary ms-2">{credential.provider}</span>
                    )}
                    <span className="badge text-bg-light border text-dark ms-2">
                        {groupedModels.length} {groupedModels.length === 1 ? 'model' : 'models'}
                    </span>
                </button>
                {credential?.restricted && <i className="fas fa-lock text-muted me-2" title="Restricted credentials"></i>}
                {addModelFormVisible && credential && !credential.external && (
                    <span className="btn-group">
                        {!credential.restricted && (
                            <button className="btn btn-outline-secondary btn-sm" onClick={() => onEditCredential(credential)} title="Edit credentials" aria-label={`Edit ${getVisibleCredentialLabel(credential)} credentials`}>
                                <i className="fas fa-edit"></i>
                            </button>
                        )}
                        {credentialHasModelList(credential) && (
                            <button
                                className="btn btn-outline-primary btn-sm"
                                onClick={() => onRefreshModels(credential)}
                                disabled={isListing}
                                title="Refresh models"
                                aria-label={`Refresh ${getVisibleCredentialLabel(credential)} models`}
                            >
                                <i className={`fas fa-${isListing ? 'spinner fa-spin' : 'sync-alt'}`}></i>
                            </button>
                        )}
                        {!credential.restricted && (
                            <button className="btn btn-outline-danger btn-sm" onClick={() => onDeleteCredential(credential.id)} title="Delete credentials" aria-label={`Delete ${getVisibleCredentialLabel(credential)} credentials`}>
                                <i className="fas fa-trash-alt"></i>
                            </button>
                        )}
                    </span>
                )}
            </div>
            {isExpanded && (
                <ul className="list-group list-group-flush">
                    {groupedModels.map((model) => (
                        <li key={model.id || model.name} className="list-group-item d-flex justify-content-between align-items-center">
                            <span>{model.name}</span>
                            {addModelFormVisible && !model.external && !credentialsById.get(model.credentialId)?.restricted && (
                                <button onClick={() => onRemoveModel(model.id)} className="btn btn-danger btn-sm" title="Remove model" aria-label={`Remove model ${model.name}`}>
                                    <i className="fas fa-trash-alt"></i>
                                </button>
                            )}
                        </li>
                    ))}
                    {credential && addModelFormVisible && !credential.restricted && (
                        <li className="list-group-item">
                            <label className="form-label small mb-1">Add model(s)</label>
                            <div className="input-group">
                                <input
                                    type="text"
                                    className="form-control"
                                    placeholder="gpt-4o, gpt-4o-mini"
                                    value={draftModelNames || ''}
                                    onChange={(event) => onDraftModelsChange(credential.id, event.target.value)}
                                />
                                <button
                                    type="button"
                                    onClick={() => onAddModels(credential.id)}
                                    className="btn btn-primary"
                                    aria-label={`Add models to ${getVisibleCredentialLabel(credential)}`}
                                >
                                    <i className="fas fa-plus"></i>
                                </button>
                            </div>
                            {listError && (
                                <div className="text-danger small mt-2">{listError}</div>
                            )}
                            {listedModels.length > 0 && (
                                <select
                                    className="form-select mt-2"
                                    multiple
                                    size="6"
                                    onChange={(event) => onAppendListedModels(credential.id, event)}
                                >
                                    {listedModels.map((name) => (
                                        <option key={name} value={name}>{name}</option>
                                    ))}
                                </select>
                            )}
                        </li>
                    )}
                </ul>
            )}
        </div>
    )
}

export default CredentialGroupCard
