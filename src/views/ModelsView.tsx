// Models View - AI model configuration and management
import { useState, useEffect, useCallback } from 'react';
import { API_URL } from '../constants';

interface AIModel {
  id: string;
  name: string;
  type: 'classification' | 'generation' | 'embedding' | 'custom';
  provider: 'openai' | 'anthropic' | 'custom';
  modelId: string;
  description: string;
  config: {
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
  };
  useCases: string[];
  isActive: boolean;
  usageCount: number;
  avgLatency: number;
  lastUsed?: string;
  createdAt: string;
}

interface ModelUsageLog {
  id: string;
  modelId: string;
  modelName: string;
  inputTokens: number;
  outputTokens: number;
  latency: number;
  timestamp: string;
}

interface ModelsViewProps {
  onToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

const MODEL_TYPES = [
  { value: 'classification', label: 'Classification', icon: '🏷️', description: 'Categorize guests, tickets, etc.' },
  { value: 'generation', label: 'Generation', icon: '✍️', description: 'Generate emails, descriptions' },
  { value: 'embedding', label: 'Embedding', icon: '🔗', description: 'Semantic search, similarity' },
  { value: 'custom', label: 'Custom', icon: '⚙️', description: 'Custom trained models' },
];

const PROVIDERS = [
  { value: 'openai', label: 'OpenAI', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'] },
  { value: 'anthropic', label: 'Anthropic', models: ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku'] },
  { value: 'custom', label: 'Custom/Self-hosted', models: ['custom-model'] },
];

const TYPE_COLORS: Record<string, string> = {
  classification: '#3b82f6',
  generation: '#8b5cf6',
  embedding: '#22c55e',
  custom: '#f59e0b',
};

export function ModelsView({ onToast }: ModelsViewProps) {
  // State
  const [models, setModels] = useState<AIModel[]>([]);
  const [usageLogs, setUsageLogs] = useState<ModelUsageLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'models' | 'usage'>('models');
  const [testPrompt, setTestPrompt] = useState('');
  const [testingModel, setTestingModel] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    type: 'classification' as AIModel['type'],
    provider: 'openai' as AIModel['provider'],
    modelId: 'gpt-4o-mini',
    description: '',
    temperature: 0.7,
    maxTokens: 1000,
    systemPrompt: '',
    useCases: [] as string[],
    isActive: true,
  });

  const [newUseCase, setNewUseCase] = useState('');

  // Fetch models
  const fetchModels = useCallback(async () => {
    try {
      const [modelsRes, usageRes] = await Promise.all([
        fetch(`${API_URL}/models`),
        fetch(`${API_URL}/models/usage`),
      ]);

      if (modelsRes.ok) {
        const data = await modelsRes.json();
        setModels(data.models || []);
      }
      if (usageRes.ok) {
        const data = await usageRes.json();
        setUsageLogs(data.logs || []);
      }
    } catch (err) {
      console.error('Failed to fetch models:', err);
      // Mock data for demo
      setModels([
        {
          id: '1',
          name: 'Guest Classifier',
          type: 'classification',
          provider: 'openai',
          modelId: 'gpt-4o-mini',
          description: 'Classifies guests into VIP, Priority, or Standard based on their profile',
          config: {
            temperature: 0.3,
            maxTokens: 500,
            systemPrompt: 'You are a guest classification AI. Analyze guest information and classify them into categories.',
          },
          useCases: ['Guest approval', 'VIP detection', 'Waitlist prioritization'],
          isActive: true,
          usageCount: 1250,
          avgLatency: 450,
          lastUsed: new Date(Date.now() - 5 * 60000).toISOString(),
          createdAt: new Date(Date.now() - 30 * 24 * 60 * 60000).toISOString(),
        },
        {
          id: '2',
          name: 'Email Generator',
          type: 'generation',
          provider: 'anthropic',
          modelId: 'claude-3-haiku',
          description: 'Generates personalized email content for event communications',
          config: {
            temperature: 0.7,
            maxTokens: 2000,
            systemPrompt: 'You are an event communications specialist. Write engaging, professional emails.',
          },
          useCases: ['Confirmation emails', 'Reminder emails', 'VIP communications'],
          isActive: true,
          usageCount: 856,
          avgLatency: 1200,
          lastUsed: new Date(Date.now() - 2 * 60 * 60000).toISOString(),
          createdAt: new Date(Date.now() - 20 * 24 * 60 * 60000).toISOString(),
        },
        {
          id: '3',
          name: 'Event Description AI',
          type: 'generation',
          provider: 'openai',
          modelId: 'gpt-4o',
          description: 'Creates compelling event descriptions from basic details',
          config: {
            temperature: 0.8,
            maxTokens: 1500,
            systemPrompt: 'You are a creative event marketer. Write exciting, engaging event descriptions.',
          },
          useCases: ['Event creation', 'Marketing copy', 'Social media posts'],
          isActive: true,
          usageCount: 234,
          avgLatency: 2100,
          lastUsed: new Date(Date.now() - 24 * 60 * 60000).toISOString(),
          createdAt: new Date(Date.now() - 15 * 24 * 60 * 60000).toISOString(),
        },
      ]);

      setUsageLogs([
        { id: '1', modelId: '1', modelName: 'Guest Classifier', inputTokens: 150, outputTokens: 50, latency: 420, timestamp: new Date(Date.now() - 5 * 60000).toISOString() },
        { id: '2', modelId: '2', modelName: 'Email Generator', inputTokens: 200, outputTokens: 450, latency: 1150, timestamp: new Date(Date.now() - 2 * 60 * 60000).toISOString() },
        { id: '3', modelId: '1', modelName: 'Guest Classifier', inputTokens: 180, outputTokens: 45, latency: 480, timestamp: new Date(Date.now() - 3 * 60 * 60000).toISOString() },
        { id: '4', modelId: '3', modelName: 'Event Description AI', inputTokens: 100, outputTokens: 800, latency: 2050, timestamp: new Date(Date.now() - 24 * 60 * 60000).toISOString() },
      ]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  // Add use case
  const handleAddUseCase = () => {
    if (newUseCase.trim() && !formData.useCases.includes(newUseCase.trim())) {
      setFormData(prev => ({ ...prev, useCases: [...prev.useCases, newUseCase.trim()] }));
      setNewUseCase('');
    }
  };

  // Remove use case
  const handleRemoveUseCase = (useCase: string) => {
    setFormData(prev => ({ ...prev, useCases: prev.useCases.filter(u => u !== useCase) }));
  };

  // Save model
  const handleSaveModel = async () => {
    if (!formData.name || !formData.modelId) {
      onToast('Please fill in name and select a model', 'error');
      return;
    }

    const newModel: AIModel = {
      id: editingId || Date.now().toString(),
      name: formData.name,
      type: formData.type,
      provider: formData.provider,
      modelId: formData.modelId,
      description: formData.description,
      config: {
        temperature: formData.temperature,
        maxTokens: formData.maxTokens,
        systemPrompt: formData.systemPrompt,
      },
      useCases: formData.useCases,
      isActive: formData.isActive,
      usageCount: editingId ? (models.find(m => m.id === editingId)?.usageCount || 0) : 0,
      avgLatency: editingId ? (models.find(m => m.id === editingId)?.avgLatency || 0) : 0,
      createdAt: editingId ? (models.find(m => m.id === editingId)?.createdAt || new Date().toISOString()) : new Date().toISOString(),
    };

    if (editingId) {
      setModels(prev => prev.map(m => m.id === editingId ? newModel : m));
    } else {
      setModels(prev => [newModel, ...prev]);
    }

    onToast(editingId ? 'Model updated' : 'Model created', 'success');
    resetForm();
  };

  // Toggle model
  const handleToggleModel = (id: string) => {
    setModels(prev => prev.map(m => m.id === id ? { ...m, isActive: !m.isActive } : m));
    const model = models.find(m => m.id === id);
    onToast(`${model?.name} ${model?.isActive ? 'disabled' : 'enabled'}`, 'info');
  };

  // Delete model
  const handleDeleteModel = (id: string) => {
    if (!confirm('Are you sure you want to delete this model?')) return;
    setModels(prev => prev.filter(m => m.id !== id));
    onToast('Model deleted', 'success');
  };

  // Test model
  const handleTestModel = async (id: string) => {
    if (!testPrompt.trim()) {
      onToast('Please enter a test prompt', 'error');
      return;
    }

    setTestingModel(id);
    setTestResult(null);

    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1500));

    const model = models.find(m => m.id === id);
    setTestResult(`[Demo Response from ${model?.name}]\n\nBased on the prompt "${testPrompt}", here's a sample response demonstrating the model's capabilities. In production, this would be the actual AI response.`);
    setTestingModel(null);
    onToast('Test completed', 'success');
  };

  // Edit model
  const handleEditModel = (model: AIModel) => {
    setFormData({
      name: model.name,
      type: model.type,
      provider: model.provider,
      modelId: model.modelId,
      description: model.description,
      temperature: model.config.temperature || 0.7,
      maxTokens: model.config.maxTokens || 1000,
      systemPrompt: model.config.systemPrompt || '',
      useCases: model.useCases,
      isActive: model.isActive,
    });
    setEditingId(model.id);
    setShowForm(true);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      type: 'classification',
      provider: 'openai',
      modelId: 'gpt-4o-mini',
      description: '',
      temperature: 0.7,
      maxTokens: 1000,
      systemPrompt: '',
      useCases: [],
      isActive: true,
    });
    setEditingId(null);
    setShowForm(false);
    setNewUseCase('');
  };

  // Stats
  const stats = {
    total: models.length,
    active: models.filter(m => m.isActive).length,
    totalUsage: models.reduce((sum, m) => sum + m.usageCount, 0),
    avgLatency: models.length > 0
      ? Math.round(models.reduce((sum, m) => sum + m.avgLatency, 0) / models.length)
      : 0,
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, border: '3px solid #222', borderTopColor: '#8b5cf6', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
          <p style={{ color: '#666' }}>Loading AI models...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>Total Models</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#fff' }}>{stats.total}</div>
        </div>
        <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>Active</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#22c55e' }}>{stats.active}</div>
        </div>
        <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>Total Calls</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#8b5cf6' }}>{stats.totalUsage.toLocaleString()}</div>
        </div>
        <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>Avg Latency</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#f59e0b' }}>{stats.avgLatency}ms</div>
        </div>
      </div>

      {/* Tabs & Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setActiveTab('models')}
            style={{
              background: activeTab === 'models' ? '#1a1a1a' : 'transparent',
              border: 'none',
              padding: '10px 16px',
              borderRadius: 8,
              color: activeTab === 'models' ? '#fff' : '#666',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            Models
          </button>
          <button
            onClick={() => setActiveTab('usage')}
            style={{
              background: activeTab === 'usage' ? '#1a1a1a' : 'transparent',
              border: 'none',
              padding: '10px 16px',
              borderRadius: 8,
              color: activeTab === 'usage' ? '#fff' : '#666',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            Usage Logs
          </button>
        </div>
        <button
          onClick={() => setShowForm(true)}
          style={{ background: '#8b5cf6', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}
        >
          + Configure Model
        </button>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#111', border: '1px solid #333', borderRadius: 16, padding: 24, width: '100%', maxWidth: 600, maxHeight: '90vh', overflow: 'auto' }}>
            <h3 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 600 }}>
              {editingId ? 'Edit Model Configuration' : 'Configure AI Model'}
            </h3>

            <div style={{ display: 'grid', gap: 16 }}>
              <div>
                <label style={{ fontSize: 13, color: '#888', display: 'block', marginBottom: 6 }}>Model Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Guest Classifier"
                  style={{ width: '100%', background: '#0a0a0a', border: '1px solid #333', color: '#fff', padding: '10px 12px', borderRadius: 8 }}
                />
              </div>

              <div>
                <label style={{ fontSize: 13, color: '#888', display: 'block', marginBottom: 8 }}>Type</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                  {MODEL_TYPES.map(type => (
                    <button
                      key={type.value}
                      onClick={() => setFormData(prev => ({ ...prev, type: type.value as AIModel['type'] }))}
                      style={{
                        background: formData.type === type.value ? TYPE_COLORS[type.value] + '20' : '#0a0a0a',
                        border: formData.type === type.value ? `1px solid ${TYPE_COLORS[type.value]}` : '1px solid #333',
                        padding: 12,
                        borderRadius: 8,
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <div style={{ fontSize: 14, marginBottom: 2 }}>{type.icon} {type.label}</div>
                      <div style={{ fontSize: 11, color: '#666' }}>{type.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 13, color: '#888', display: 'block', marginBottom: 6 }}>Provider</label>
                  <select
                    value={formData.provider}
                    onChange={(e) => {
                      const provider = e.target.value as AIModel['provider'];
                      const providerInfo = PROVIDERS.find(p => p.value === provider);
                      setFormData(prev => ({
                        ...prev,
                        provider,
                        modelId: providerInfo?.models[0] || '',
                      }));
                    }}
                    style={{ width: '100%', background: '#0a0a0a', border: '1px solid #333', color: '#fff', padding: '10px 12px', borderRadius: 8 }}
                  >
                    {PROVIDERS.map(provider => (
                      <option key={provider.value} value={provider.value}>{provider.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 13, color: '#888', display: 'block', marginBottom: 6 }}>Model *</label>
                  <select
                    value={formData.modelId}
                    onChange={(e) => setFormData(prev => ({ ...prev, modelId: e.target.value }))}
                    style={{ width: '100%', background: '#0a0a0a', border: '1px solid #333', color: '#fff', padding: '10px 12px', borderRadius: 8 }}
                  >
                    {PROVIDERS.find(p => p.value === formData.provider)?.models.map(model => (
                      <option key={model} value={model}>{model}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label style={{ fontSize: 13, color: '#888', display: 'block', marginBottom: 6 }}>Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  rows={2}
                  placeholder="What does this model do?"
                  style={{ width: '100%', background: '#0a0a0a', border: '1px solid #333', color: '#fff', padding: '10px 12px', borderRadius: 8, resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 13, color: '#888', display: 'block', marginBottom: 6 }}>Temperature: {formData.temperature}</label>
                  <input
                    type="range"
                    value={formData.temperature}
                    onChange={(e) => setFormData(prev => ({ ...prev, temperature: parseFloat(e.target.value) }))}
                    min={0}
                    max={1}
                    step={0.1}
                    style={{ width: '100%' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#666' }}>
                    <span>Precise</span>
                    <span>Creative</span>
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: 13, color: '#888', display: 'block', marginBottom: 6 }}>Max Tokens</label>
                  <input
                    type="number"
                    value={formData.maxTokens}
                    onChange={(e) => setFormData(prev => ({ ...prev, maxTokens: parseInt(e.target.value) || 1000 }))}
                    min={100}
                    max={4000}
                    style={{ width: '100%', background: '#0a0a0a', border: '1px solid #333', color: '#fff', padding: '10px 12px', borderRadius: 8 }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 13, color: '#888', display: 'block', marginBottom: 6 }}>System Prompt</label>
                <textarea
                  value={formData.systemPrompt}
                  onChange={(e) => setFormData(prev => ({ ...prev, systemPrompt: e.target.value }))}
                  rows={4}
                  placeholder="Instructions for the AI model..."
                  style={{ width: '100%', background: '#0a0a0a', border: '1px solid #333', color: '#fff', padding: '10px 12px', borderRadius: 8, resize: 'vertical', fontFamily: 'monospace' }}
                />
              </div>

              <div>
                <label style={{ fontSize: 13, color: '#888', display: 'block', marginBottom: 6 }}>Use Cases</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                  {formData.useCases.map(useCase => (
                    <span key={useCase} style={{ background: '#333', padding: '4px 10px', borderRadius: 4, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {useCase}
                      <button
                        onClick={() => handleRemoveUseCase(useCase)}
                        style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', padding: 0 }}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    value={newUseCase}
                    onChange={(e) => setNewUseCase(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddUseCase()}
                    placeholder="Add use case..."
                    style={{ flex: 1, background: '#0a0a0a', border: '1px solid #333', color: '#fff', padding: '8px 12px', borderRadius: 6 }}
                  />
                  <button
                    onClick={handleAddUseCase}
                    style={{ background: '#333', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 6, cursor: 'pointer' }}
                  >
                    Add
                  </button>
                </div>
              </div>

              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData(prev => ({ ...prev, isActive: e.target.checked }))}
                  />
                  <span style={{ fontSize: 14 }}>Enable model immediately</span>
                </label>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
              <button
                onClick={resetForm}
                style={{ flex: 1, background: '#333', color: '#fff', border: 'none', padding: '12px', borderRadius: 8, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveModel}
                style={{ flex: 1, background: '#8b5cf6', color: '#fff', border: 'none', padding: '12px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}
              >
                {editingId ? 'Update' : 'Save'} Configuration
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Models Tab */}
      {activeTab === 'models' && (
        <div style={{ display: 'grid', gap: 16 }}>
          {models.map(model => (
            <div
              key={model.id}
              style={{
                background: '#0a0a0a',
                border: model.isActive ? '1px solid #22c55e30' : '1px solid #1a1a1a',
                borderRadius: 12,
                padding: 20,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 20 }}>{MODEL_TYPES.find(t => t.value === model.type)?.icon}</span>
                    <span style={{ fontSize: 18, fontWeight: 600, color: '#fff' }}>{model.name}</span>
                    <span style={{
                      background: TYPE_COLORS[model.type] + '20',
                      color: TYPE_COLORS[model.type],
                      padding: '2px 8px',
                      borderRadius: 4,
                      fontSize: 11,
                      textTransform: 'capitalize',
                    }}>
                      {model.type}
                    </span>
                  </div>
                  <p style={{ fontSize: 14, color: '#888', margin: 0 }}>{model.description}</p>
                </div>
                <span style={{
                  background: model.isActive ? '#22c55e20' : '#6b728020',
                  color: model.isActive ? '#22c55e' : '#6b7280',
                  padding: '4px 12px',
                  borderRadius: 20,
                  fontSize: 12,
                  fontWeight: 500,
                }}>
                  {model.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>

              <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: 13, color: '#666' }}>
                <span>{model.provider} / {model.modelId}</span>
                <span>•</span>
                <span>Temp: {model.config.temperature}</span>
                <span>•</span>
                <span>Max: {model.config.maxTokens} tokens</span>
              </div>

              {model.useCases.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                  {model.useCases.map(useCase => (
                    <span key={useCase} style={{ background: '#1a1a1a', padding: '4px 10px', borderRadius: 6, fontSize: 12, color: '#888' }}>
                      {useCase}
                    </span>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', gap: 24, marginBottom: 16, color: '#666', fontSize: 13 }}>
                <span>Calls: {model.usageCount.toLocaleString()}</span>
                <span>Avg latency: {model.avgLatency}ms</span>
                {model.lastUsed && <span>Last used: {new Date(model.lastUsed).toLocaleString()}</span>}
              </div>

              {/* Test Section */}
              <div style={{ background: '#111', border: '1px solid #222', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    value={testPrompt}
                    onChange={(e) => setTestPrompt(e.target.value)}
                    placeholder="Enter test prompt..."
                    style={{ flex: 1, background: '#0a0a0a', border: '1px solid #333', color: '#fff', padding: '8px 12px', borderRadius: 6, fontSize: 13 }}
                  />
                  <button
                    onClick={() => handleTestModel(model.id)}
                    disabled={testingModel === model.id}
                    style={{
                      background: '#8b5cf6',
                      color: '#fff',
                      border: 'none',
                      padding: '8px 16px',
                      borderRadius: 6,
                      fontSize: 12,
                      cursor: testingModel === model.id ? 'wait' : 'pointer',
                      opacity: testingModel === model.id ? 0.7 : 1,
                    }}
                  >
                    {testingModel === model.id ? 'Testing...' : 'Test'}
                  </button>
                </div>
                {testResult && testingModel === null && (
                  <div style={{ marginTop: 10, padding: 10, background: '#0a0a0a', borderRadius: 6, fontSize: 13, color: '#888', whiteSpace: 'pre-wrap' }}>
                    {testResult}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => handleToggleModel(model.id)}
                  style={{
                    background: model.isActive ? '#333' : '#22c55e',
                    color: model.isActive ? '#fff' : '#000',
                    border: 'none',
                    padding: '6px 16px',
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  {model.isActive ? 'Disable' : 'Enable'}
                </button>
                <button
                  onClick={() => handleEditModel(model)}
                  style={{ background: '#333', color: '#fff', border: 'none', padding: '6px 16px', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDeleteModel(model.id)}
                  style={{ background: 'transparent', color: '#ef4444', border: '1px solid #ef4444', padding: '6px 16px', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}

          {models.length === 0 && (
            <div style={{ textAlign: 'center', padding: 60 }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🤖</div>
              <p style={{ color: '#888', fontSize: 16 }}>No AI models configured</p>
              <button
                onClick={() => setShowForm(true)}
                style={{ marginTop: 16, background: '#8b5cf6', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}
              >
                + Configure First Model
              </button>
            </div>
          )}
        </div>
      )}

      {/* Usage Tab */}
      {activeTab === 'usage' && (
        <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #1a1a1a' }}>
                <th style={{ textAlign: 'left', padding: '12px 16px', color: '#888', fontSize: 13 }}>Time</th>
                <th style={{ textAlign: 'left', padding: '12px 16px', color: '#888', fontSize: 13 }}>Model</th>
                <th style={{ textAlign: 'right', padding: '12px 16px', color: '#888', fontSize: 13 }}>Input Tokens</th>
                <th style={{ textAlign: 'right', padding: '12px 16px', color: '#888', fontSize: 13 }}>Output Tokens</th>
                <th style={{ textAlign: 'right', padding: '12px 16px', color: '#888', fontSize: 13 }}>Latency</th>
              </tr>
            </thead>
            <tbody>
              {usageLogs.map(log => (
                <tr key={log.id} style={{ borderBottom: '1px solid #111' }}>
                  <td style={{ padding: '12px 16px', color: '#666', fontSize: 13 }}>
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td style={{ padding: '12px 16px', fontWeight: 500 }}>{log.modelName}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', color: '#3b82f6' }}>{log.inputTokens}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', color: '#22c55e' }}>{log.outputTokens}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', color: '#f59e0b' }}>{log.latency}ms</td>
                </tr>
              ))}
            </tbody>
          </table>

          {usageLogs.length === 0 && (
            <div style={{ textAlign: 'center', padding: 60 }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
              <p style={{ color: '#888', fontSize: 16 }}>No usage data yet</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
