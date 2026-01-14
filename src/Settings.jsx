import React, { useState } from 'react'

const initialModelSettings = {
  name: '', 
  endpoint: 'https://api.openai.com/v1/chat/completions', 
  apiKey: ''
}

function Settings({ models, onSave, onClose }) {
  const [modelList, setModelList] = useState(models || [])
  const [newModel, setNewModel] = useState(initialModelSettings)

  const handleAddModel = () => {
    if (newModel.name && newModel.endpoint) {
      setModelList([...modelList, { ...newModel }])
      setNewModel(initialModelSettings)
    }
  }

  const handleRemoveModel = (index) => {
    const updatedModels = modelList.filter((_, i) => i !== index)
    setModelList(updatedModels)
  }

  const handleSave = () => {
    onSave(modelList)
    onClose()
  }

  return (
    <>
      {/* Bootstrap Modal Backdrop */}
      <div className="modal-backdrop fade show" style={{zIndex: 1040}}></div>
      
      {/* Bootstrap Modal */}
      <div className="modal d-block" tabIndex="-1" style={{zIndex: 1050}}>
        <div className="modal-dialog modal-dialog-centered modal-dialog-scrollable">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title">AI Model Settings</h5>
              <button type="button" className="btn-close" onClick={onClose} aria-label="Close"></button>
            </div>
            
            <div className="modal-body">
              {/* Configured Models List */}
              <div className="mb-4">
                <h6 className="mb-3">Configured Models</h6>
                {modelList.length === 0 ? (
                  <p className="text-muted small">No models configured yet.</p>
                ) : (
                  <div className="d-flex flex-column gap-2">
                    {modelList.map((model, index) => (
                      <div key={index} className="card">
                        <div className="card-body p-3">
                          <div className="d-flex justify-content-between align-items-start">
                            <div className="flex-grow-1">
                              <div className="fw-semibold">
                                {model.name}
                                {model.external && (
                                  <i className="fas fa-globe ms-2 text-muted" title="External Model"></i>
                                )}
                              </div>
                              <div className="text-muted small">{model.endpoint}</div>
                            </div>
                            {!model.external && (
                              <button 
                                onClick={() => handleRemoveModel(index)}
                                className="btn btn-danger btn-sm ms-3"
                              >
                                <i className="fas fa-trash-alt"></i>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Add New Model Form */}
              <div>
                <h6 className="mb-3">Add New Model</h6>
                <div className="d-flex flex-column gap-3">
                  <div>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Model Name"
                      value={newModel.name}
                      onChange={(e) => setNewModel({ ...newModel, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Endpoint URL"
                      value={newModel.endpoint}
                      onChange={(e) => setNewModel({ ...newModel, endpoint: e.target.value })}
                    />
                  </div>
                  <div>
                    <input
                      type="password"
                      className="form-control"
                      placeholder="API Key (optional)"
                      value={newModel.apiKey}
                      onChange={(e) => setNewModel({ ...newModel, apiKey: e.target.value })}
                    />
                  </div>
                  <button 
                    onClick={handleAddModel} 
                    className="btn btn-primary"
                    disabled={!newModel.name || !newModel.endpoint}
                  >
                    <i className="fas fa-plus me-2"></i>Add Model
                  </button>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button onClick={onClose} className="btn btn-secondary">Cancel</button>
              <button onClick={handleSave} className="btn btn-success">Save</button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export default Settings
