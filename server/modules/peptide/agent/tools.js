// The 11 PeptideConnect agent tools, in OpenAI function-calling format.

export const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_suppliers',
      description: 'Busca suppliers de péptidos con Drug Master File (DMF) activo en FDA. Retorna compliance score, péptidos que producen y contacto. Úsala para encontrar fabricantes/proveedores de APIs.',
      parameters: {
        type: 'object',
        properties: {
          peptide_name: { type: 'string', description: "Nombre del péptido (ej: 'sermorelin'). Opcional." },
          min_compliance_score: { type: 'integer', description: 'Score mínimo 0-100. Default 60.' },
          dmf_status: { type: 'string', enum: ['A', 'I', 'all'], description: 'A=activo, I=inactivo, all=todos. Default A.' },
          limit: { type: 'integer', description: 'Número de resultados. Default 10.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_pharmacies',
      description: 'Busca farmacias 503B registradas con FDA que compoundan péptidos. Retorna compliance score, péptidos, estados y contacto. Úsala para encontrar compradores potenciales.',
      parameters: {
        type: 'object',
        properties: {
          state: { type: 'string', description: 'Código de estado (FL, TX, CA). Opcional.' },
          peptide: { type: 'string', description: 'Filtrar por péptido. Opcional.' },
          min_compliance_score: { type: 'integer' },
          nabp_only: { type: 'boolean' },
          limit: { type: 'integer' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_doctors',
      description: 'Busca médicos con NPI activo en especialidades relevantes (Functional Medicine, Endocrinology, Anti-Aging, Sports Medicine, Integrative Medicine).',
      parameters: {
        type: 'object',
        properties: {
          specialty: { type: 'string', description: "Especialidad (ej: 'Functional Medicine')." },
          state: { type: 'string', description: "Estado USA (ej: 'FL')." },
          city: { type: 'string' },
          credential: { type: 'string', description: 'MD, DO, NP, PA. Opcional.' },
          limit: { type: 'integer' },
        },
        required: ['specialty', 'state'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_drug_shortages',
      description: 'Obtiene péptidos/drugs en shortage activo según FDA. Son oportunidades de negocio. Úsala para detectar oportunidades o responder sobre el mercado.',
      parameters: {
        type: 'object',
        properties: {
          search_term: { type: 'string', description: 'Términos de búsqueda.' },
          status: { type: 'string', enum: ['active', 'resolved', 'all'] },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_compliance_score',
      description: 'Calcula y explica el compliance score (0-100) de un supplier, farmacia o doctor. Úsala antes de recomendar conectar dos entidades.',
      parameters: {
        type: 'object',
        properties: {
          entity_type: { type: 'string', enum: ['supplier', 'pharmacy', 'doctor'] },
          entity_id: { type: 'string', description: 'UUID o nombre.' },
          entity_name: { type: 'string', description: 'Nombre si no tienes el ID.' },
        },
        required: ['entity_type'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_match',
      description: 'Crea un match formal entre dos entidades, registra la conexión, calcula el fee y prepara la notificación. Úsala cuando el usuario confirme la conexión.',
      parameters: {
        type: 'object',
        properties: {
          entity_a_type: { type: 'string', enum: ['supplier', 'pharmacy', 'doctor'] },
          entity_a_id: { type: 'string' },
          entity_b_type: { type: 'string', enum: ['supplier', 'pharmacy', 'doctor'] },
          entity_b_id: { type: 'string' },
          peptide: { type: 'string' },
          notes: { type: 'string' },
        },
        required: ['entity_a_type', 'entity_a_id', 'entity_b_type', 'entity_b_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'draft_email',
      description: 'Redacta un email profesional B2B personalizado y healthcare-compliant (sin claims médicos no respaldados).',
      parameters: {
        type: 'object',
        properties: {
          recipient_type: { type: 'string', enum: ['supplier', 'pharmacy', 'doctor'] },
          recipient_name: { type: 'string' },
          recipient_id: { type: 'string' },
          purpose: { type: 'string', description: "ej: 'introduction', 'shortage_alert', 'invitation'." },
          peptide_focus: { type: 'string' },
          custom_context: { type: 'string' },
          language: { type: 'string', enum: ['english', 'spanish'] },
        },
        required: ['recipient_type', 'recipient_name', 'purpose'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_email',
      description: 'Envía un email via Resend desde la plataforma y lo registra. Siempre confirma con el usuario antes de enviar.',
      parameters: {
        type: 'object',
        properties: {
          to_email: { type: 'string' },
          to_name: { type: 'string' },
          subject: { type: 'string' },
          body: { type: 'string' },
          recipient_id: { type: 'string' },
          recipient_type: { type: 'string' },
        },
        required: ['to_email', 'subject', 'body'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_market_intel',
      description: 'Obtiene inteligencia de mercado combinando shortages FDA, precios USDA NASS, trials y cambios regulatorios.',
      parameters: {
        type: 'object',
        properties: {
          focus: { type: 'string', enum: ['shortages', 'pricing', 'regulatory', 'trials', 'all'] },
          peptide: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_peptide_status',
      description: 'Status regulatorio completo de un péptido: Categoría 1/2 de la FDA 503A Bulks List, shortage activo, trials, y opciones de compounding.',
      parameters: {
        type: 'object',
        properties: { peptide_name: { type: 'string' } },
        required: ['peptide_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_clinical_trials',
      description: 'Busca ensayos clínicos activos/recientes de péptidos en ClinicalTrials.gov.',
      parameters: {
        type: 'object',
        properties: {
          peptide: { type: 'string' },
          phase: { type: 'string', enum: ['PHASE2', 'PHASE3', 'PHASE4', 'all'] },
          status: { type: 'string', enum: ['RECRUITING', 'ACTIVE', 'COMPLETED', 'all'] },
          limit: { type: 'integer' },
        },
      },
    },
  },
];
