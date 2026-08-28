import React from 'react'

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

function CredentialFormSection({
    credentialProvider,
    credentialForm,
    editingCredentialId,
    onChangeProvider,
    onFormChange,
    onSaveCredential,
}) {
    return (
        <section className="border-top pt-3">
            <h6 className="mb-3">{editingCredentialId ? 'Edit Credentials' : 'New Credentials'}</h6>
            <div className="btn-group mb-3" role="group" aria-label="Credential provider">
                {['openai', 'azure', 'manual'].map((provider) => (
                    <button
                        key={provider}
                        type="button"
                        className={`btn btn-outline-primary ${credentialProvider === provider ? 'active' : ''}`}
                        onClick={() => onChangeProvider(provider)}
                    >
                        {provider === 'openai' ? 'OpenAI' : provider === 'azure' ? 'Azure' : 'Manual'}
                    </button>
                ))}
            </div>
            <div className="d-flex flex-column gap-3">
                {field(credentialForm, onFormChange, 'label', 'Credential label (optional)', {placeholder: 'e.g. Work OpenAI'})}
                {credentialProvider === 'openai' && (
                    <>
                        {field(credentialForm, onFormChange, 'apiKey', 'API key', {type: 'password'})}
                        {field(credentialForm, onFormChange, 'modelListUrl', 'Model list URL')}
                    </>
                )}
                {credentialProvider === 'azure' && (
                    <>
                        {field(credentialForm, onFormChange, 'clientId', 'Client ID')}
                        {field(credentialForm, onFormChange, 'tenantId', 'Tenant ID')}
                        {field(credentialForm, onFormChange, 'resourceName', 'Azure OpenAI resource name')}
                        {field(credentialForm, onFormChange, 'chatScopes', 'Chat scopes (comma-separated)')}
                        {field(credentialForm, onFormChange, 'apiVersion', 'Chat API version')}
                        {field(credentialForm, onFormChange, 'modelListUrl', 'Deployment list URL')}
                        {field(credentialForm, onFormChange, 'modelListScopes', 'Deployment list scopes (comma-separated)')}
                    </>
                )}
                {credentialProvider === 'manual' && (
                    <>
                        {field(credentialForm, onFormChange, 'endpoint', 'Chat completion endpoint URL')}
                        {field(credentialForm, onFormChange, 'apiKey', 'API key (optional)', {type: 'password'})}
                        {field(credentialForm, onFormChange, 'modelListUrl', 'Model list URL (optional)')}
                    </>
                )}
                <div className="form-check">
                    <input
                        id="modelListEnabled"
                        className="form-check-input"
                        type="checkbox"
                        checked={credentialForm.modelListEnabled}
                        onChange={(event) => onFormChange({...credentialForm, modelListEnabled: event.target.checked})}
                    />
                    <label className="form-check-label" htmlFor="modelListEnabled">Enable model listing</label>
                </div>
                <button type="button" onClick={onSaveCredential} className="btn btn-primary align-self-start">
                    <i className={`fas fa-${editingCredentialId ? 'save' : 'plus'} me-2`}></i>
                    {editingCredentialId ? 'Save Credentials' : 'Create Credentials'}
                </button>
            </div>
        </section>
    )
}

export default CredentialFormSection
