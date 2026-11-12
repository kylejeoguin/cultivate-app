const SUGGESTIONS: Record<string, string[]> = {
  math: [
    'Measure and record daily egg or milk production in a simple log',
    'Calculate feed-to-production ratios for your animals',
    'Measure garden bed dimensions and compute area for seed spacing',
    'Track weekly spending on farm supplies and compare to a budget',
    'Count livestock headcount and graph changes over time',
  ],
  reading: [
    'Read a chapter from a homesteading or farming book together',
    'Study seed packet instructions and discuss the planting info',
    'Read a recipe for preserving garden produce',
    'Look up an animal health article and discuss what you learned',
    'Read an equipment manual and identify the key steps',
  ],
  writing: [
    'Keep a farm journal — describe what happened on the homestead today',
    'Write planting notes: what was planted, where, and when',
    'Write step-by-step instructions for a chore you know well',
    'Draft a list of goals for the garden this season',
    'Label garden beds or storage jars with handwritten markers',
  ],
  science: [
    'Document plant growth stages with dates and photos',
    'Track egg production and graph changes over time',
    'Observe and sketch an insect or animal found on the property',
    'Describe the properties of soil from different spots on your land',
    'Study the life cycle of a plant you are growing from seed',
  ],
  history: [
    'Research the history of a farming practice you use today',
    'Study where a food crop originated and how it spread worldwide',
    'Learn about traditional food preservation methods through history',
    'Read about the homestead movement in American history',
    'Discuss how farming in your region has changed over generations',
  ],
  'social studies': [
    'Map your property and the surrounding community',
    'Research local food systems and farmers markets in your area',
    'Discuss where your food comes from and how it gets to the store',
    'Study your county\'s land use and agricultural history',
    'Learn about a neighboring culture\'s traditional farming practices',
  ],
  health: [
    'Discuss food safety rules while canning or food preserving',
    'Practice first aid basics relevant to farm and outdoor work',
    'Talk through nutrition from a meal made with garden produce',
    'Review safe tool handling and farm safety rules together',
    'Track physical activity from a week of homestead chores',
  ],
  pe: [
    'Fence building or repair — log the time as physical activity',
    'Haul and stack firewood and record how long it took',
    'Full garden bed prep: digging, turning, and planting',
    'Hike the property boundary and document what you see',
    'Animal care morning routine as structured movement',
  ],
  art: [
    'Sketch a plant, insect, or animal found on the property',
    'Design a garden layout map for the coming season',
    'Photograph homestead progress and create a simple photo log',
    'Make a nature collection: pressed leaves, seed packets, feathers',
    'Paint or draw a favorite scene from the homestead',
  ],
  music: [
    'Listen to and discuss folk or bluegrass music with farming roots',
    'Learn a traditional work song or folk song together',
    'Record sounds from nature on the property and identify them',
  ],
  'life skills': [
    'Walk through a full tool maintenance routine together',
    'Plan and cost out a small project from start to finish',
    'Practice a food preservation method: canning, dehydrating, or freezing',
    'Budget for next season\'s seed order',
    'Cook a full meal using only what is available from the property',
  ],
  cooking: [
    'Make a recipe using vegetables currently growing in the garden',
    'Practice a preservation method and explain the science behind it',
    'Compare nutrition in garden-grown produce vs store-bought',
    'Learn to read and scale a recipe up or down',
    'Bake bread from scratch and document each step',
  ],
  'nature study': [
    'Keep a nature journal: sketch and identify 3 things found outside today',
    'Track bird species spotted on the property over a week',
    'Identify and document insects in the garden — beneficial vs pest',
    'Record daily weather and look for patterns over a month',
    'Collect and compare soil samples from different spots on the property',
  ],
  'foreign language': [
    'Label common homestead items with their name in a target language',
    'Learn vocabulary for farm animals, plants, and tools',
    'Read a simple recipe or instruction set in a target language',
  ],
  bible: [
    'Read and discuss a passage about stewardship of the land',
    'Study parables involving farming, planting, or harvest',
    'Discuss gratitude for the food and land you work',
  ],
  stem: [
    'Design and build a simple tool, trellis, or garden structure',
    'Set up a rain gauge and track precipitation weekly',
    'Build a simple compost thermometer and record temperature changes',
    'Design an efficient layout for a new garden bed using graph paper',
    'Troubleshoot a broken tool or piece of equipment step by step',
  ],
  typing: [
    'Type up your farm journal entry from this week',
    'Create a simple spreadsheet to track garden yield',
    'Research and type a short report on a homestead topic',
  ],
  logic: [
    'Identify a real homestead problem and design the best solution',
    'Work through a troubleshooting checklist for a broken tool',
    'Compare the cost and benefit of two approaches to a farm project',
  ],
}

const ALIAS_MAP: Array<[string, string]> = [
  ['math', 'math'],
  ['reading', 'reading'],
  ['language arts', 'writing'],
  ['writing', 'writing'],
  ['english', 'writing'],
  ['composition', 'writing'],
  ['science', 'science'],
  ['history', 'history'],
  ['social studies', 'social studies'],
  ['geography', 'social studies'],
  ['health', 'health'],
  ['physical education', 'pe'],
  ['pe /', 'pe'],
  ['movement', 'pe'],
  ['physical', 'pe'],
  ['art', 'art'],
  ['music', 'music'],
  ['life skills', 'life skills'],
  ['homestead', 'life skills'],
  ['cooking', 'cooking'],
  ['nutrition', 'cooking'],
  ['nature study', 'nature study'],
  ['nature', 'nature study'],
  ['foreign language', 'foreign language'],
  ['spanish', 'foreign language'],
  ['french', 'foreign language'],
  ['bible', 'bible'],
  ['character', 'bible'],
  ['stem', 'stem'],
  ['building', 'stem'],
  ['typing', 'typing'],
  ['computer', 'typing'],
  ['logic', 'logic'],
  ['critical thinking', 'logic'],
]

export function getSuggestions(subjectName: string): string[] {
  const normalized = subjectName.toLowerCase()
  if (SUGGESTIONS[normalized]) return SUGGESTIONS[normalized]
  for (const [alias, key] of ALIAS_MAP) {
    if (normalized.includes(alias)) return SUGGESTIONS[key] ?? []
  }
  return []
}
