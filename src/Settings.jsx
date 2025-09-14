import React, { useEffect, useState } from 'react'
import './Settings.css'

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
    <div className="settings-overlay">
      <div className="settings-panel">
        <h2>AI Model Settings</h2>
        
        <div className="settings-content">
          <div className="model-list">
            <h3>Configured Models</h3>
            {modelList.map((model, index) => (
              <div key={index} className="model-item">
                <div className="model-info">
                  <div>{model.name}</div>
                  <div className="model-endpoint">{model.endpoint}</div>
                </div>
                <button 
                  onClick={() => handleRemoveModel(index)}
                  className="remove-model-btn"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

          <div className="add-model-form">
            <h3>Add New Model</h3>
            <input
              type="text"
              placeholder="Model Name"
              value={newModel.name}
              onChange={(e) => setNewModel({ ...newModel, name: e.target.value })}
            />
            <input
              type="text"
              placeholder="Endpoint URL"
              value={newModel.endpoint}
              onChange={(e) => setNewModel({ ...newModel, endpoint: e.target.value })}
            />
            <input
              type="password"
              placeholder="API Key (optional)"
              value={newModel.apiKey}
              onChange={(e) => setNewModel({ ...newModel, apiKey: e.target.value })}
            />
            <button onClick={handleAddModel}>Add Model</button>
          </div>
        </div>

        <div className="settings-actions">
          <button onClick={handleSave} className="save-btn">Save</button>
          <button onClick={onClose} className="cancel-btn">Cancel</button>
        </div>
      </div>
    </div>
  )
}

export default Settings
