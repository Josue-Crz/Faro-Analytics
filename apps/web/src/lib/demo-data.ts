export type SignalStatus =
  'clear' | 'attention' | 'awaiting' | 'due' | 'ready' | 'insufficient' | 'issue' | 'complete';

export interface ContactRecord {
  id: string;
  name: string;
  initials: string;
  title: string;
  email: string;
  organization: string;
  organizationId: string;
  type: 'Sponsor' | 'Partner' | 'Participant' | 'Speaker' | 'Donor';
  campaign: string;
  stage: string;
  source: string;
  timezone: string;
  tags: string[];
  lastInteraction: string;
  nextAction: string;
  responseRate: number;
  consent: 'Granted' | 'Unknown' | 'Suppressed';
}

export interface FollowUpRecord {
  id: string;
  contactId: string;
  contact: string;
  initials: string;
  organization: string;
  campaign: string;
  reason: string;
  due: string;
  dueGroup: 'Overdue' | 'Today' | 'Upcoming' | 'Snoozed' | 'Completed';
  priority: 'High' | 'Medium' | 'Low';
  status: SignalStatus;
  statusLabel: string;
  channel: 'Email' | 'Phone' | 'Meeting';
  recommendedWindow: string;
  confidence: number;
  sufficiency: 'High' | 'Medium' | 'Sparse';
  reasonCodes: string[];
  explanation: string;
  lastResponse: string;
  lastResponseAt: string;
  nextAction: string;
  bobRequestId?: string;
  draftId?: string;
}

export const workspace = {
  id: 'ws-beacon-lab',
  name: 'Northstar Programs',
  timezone: 'America/Los_Angeles',
  quietHours: '18:00–08:00',
  role: 'Workspace admin',
};

export const dashboardMetrics = [
  {
    label: 'Outreach sent',
    value: '1,284',
    change: '+8.2%',
    direction: 'up',
    detail: 'vs. prior 30 days',
  },
  {
    label: 'Overall response rate',
    value: '38.6%',
    change: '+3.4 pts',
    direction: 'up',
    detail: '496 responses',
  },
  {
    label: 'Positive response rate',
    value: '24.8%',
    change: '+1.9 pts',
    direction: 'up',
    detail: 'Clear signal',
  },
  {
    label: 'Follow-ups due',
    value: '18',
    change: '6 overdue',
    direction: 'warn',
    detail: 'Needs attention',
  },
  {
    label: 'Average response time',
    value: '9h 42m',
    change: '−1h 16m',
    direction: 'up',
    detail: 'Faster this period',
  },
  {
    label: 'Active sponsorship value',
    value: '$486k',
    change: '+$72k',
    direction: 'up',
    detail: 'Weighted: $271k',
  },
] as const;

export const responseTrend = [
  { group: 'Response rate', date: '2026-06-06', value: 31 },
  { group: 'Response rate', date: '2026-06-13', value: 34 },
  { group: 'Response rate', date: '2026-06-20', value: 33 },
  { group: 'Response rate', date: '2026-06-27', value: 37 },
  { group: 'Response rate', date: '2026-07-04', value: 39 },
  { group: 'Positive response', date: '2026-06-06', value: 19 },
  { group: 'Positive response', date: '2026-06-13', value: 21 },
  { group: 'Positive response', date: '2026-06-20', value: 20 },
  { group: 'Positive response', date: '2026-06-27', value: 23 },
  { group: 'Positive response', date: '2026-07-04', value: 25 },
];

export const heatmap = [
  { day: 'Mon', values: [28, 42, 61, 54, 37, 18] },
  { day: 'Tue', values: [31, 58, 86, 68, 44, 21] },
  { day: 'Wed', values: [26, 63, 91, 72, 48, 24] },
  { day: 'Thu', values: [24, 55, 79, 66, 51, 27] },
  { day: 'Fri', values: [20, 47, 62, 49, 35, 16] },
];

export const pipeline = [
  { stage: 'Prospecting', count: 24, value: 214000, percent: 100 },
  { stage: 'Qualified', count: 17, value: 168000, percent: 71 },
  { stage: 'Engaged', count: 11, value: 103000, percent: 46 },
  { stage: 'Proposal', count: 7, value: 74000, percent: 29 },
  { stage: 'Negotiation', count: 4, value: 52000, percent: 17 },
  { stage: 'Committed', count: 3, value: 43000, percent: 13 },
];

export const contacts: ContactRecord[] = [
  {
    id: 'ct_amara_okafor',
    name: 'Amara Okafor',
    initials: 'AO',
    title: 'Director of Community Investment',
    email: 'amara.okafor@example.org',
    organization: 'Solace Renewables',
    organizationId: 'org_solace',
    type: 'Sponsor',
    campaign: 'Harbor Summit 2026',
    stage: 'Engaged',
    source: 'Google Sheets',
    timezone: 'America/Chicago',
    tags: ['Sustainability', 'Decision maker'],
    lastInteraction: 'Jul 9, 10:18 AM',
    nextAction: 'Share community impact brief',
    responseRate: 67,
    consent: 'Granted',
  },
  {
    id: 'ct_luca_bianchi',
    name: 'Luca Bianchi',
    initials: 'LB',
    title: 'Partnerships Lead',
    email: 'luca.bianchi@example.org',
    organization: 'Civic Thread Labs',
    organizationId: 'org_civic_thread',
    type: 'Partner',
    campaign: 'Community Data Collaborative',
    stage: 'Proposal',
    source: 'Manual',
    timezone: 'Europe/Rome',
    tags: ['Data', 'Warm intro'],
    lastInteraction: 'Jul 8, 3:42 PM',
    nextAction: 'Confirm technical workshop scope',
    responseRate: 54,
    consent: 'Granted',
  },
  {
    id: 'ct_maya_chen',
    name: 'Maya Chen',
    initials: 'MC',
    title: 'Brand Partnerships Manager',
    email: 'maya.chen@example.org',
    organization: 'Meridian Outdoor',
    organizationId: 'org_meridian',
    type: 'Sponsor',
    campaign: 'Harbor Summit 2026',
    stage: 'Negotiation',
    source: 'Google Sheets',
    timezone: 'America/Los_Angeles',
    tags: ['Outdoor', 'High value'],
    lastInteraction: 'Jul 7, 9:05 AM',
    nextAction: 'Address category exclusivity question',
    responseRate: 73,
    consent: 'Granted',
  },
  {
    id: 'ct_noah_williams',
    name: 'Noah Williams',
    initials: 'NW',
    title: 'Program Officer',
    email: 'noah.williams@example.org',
    organization: 'Brightwater Foundation',
    organizationId: 'org_brightwater',
    type: 'Donor',
    campaign: 'Youth Navigation Fund',
    stage: 'Qualified',
    source: 'Referral',
    timezone: 'America/New_York',
    tags: ['Youth', 'Foundation'],
    lastInteraction: 'Jul 5, 1:30 PM',
    nextAction: 'Send outcomes framework',
    responseRate: 42,
    consent: 'Unknown',
  },
  {
    id: 'ct_elena_torres',
    name: 'Elena Torres',
    initials: 'ET',
    title: 'Community Programs VP',
    email: 'elena.torres@example.org',
    organization: 'Atlas Cooperative Bank',
    organizationId: 'org_atlas',
    type: 'Sponsor',
    campaign: 'Youth Navigation Fund',
    stage: 'Contacted',
    source: 'Google Sheets',
    timezone: 'America/Denver',
    tags: ['Financial inclusion'],
    lastInteraction: 'Jul 3, 11:22 AM',
    nextAction: 'Wait until next quarter',
    responseRate: 29,
    consent: 'Granted',
  },
  {
    id: 'ct_samir_patel',
    name: 'Samir Patel',
    initials: 'SP',
    title: 'Co-founder',
    email: 'samir.patel@example.org',
    organization: 'Common Ground Foods',
    organizationId: 'org_common_ground',
    type: 'Partner',
    campaign: 'Local Futures Series',
    stage: 'Committed',
    source: 'Event signup',
    timezone: 'America/Los_Angeles',
    tags: ['Food systems', 'Speaker'],
    lastInteraction: 'Jul 9, 4:15 PM',
    nextAction: 'Confirm speaker logistics',
    responseRate: 81,
    consent: 'Granted',
  },
  {
    id: 'ct_ivy_brooks',
    name: 'Ivy Brooks',
    initials: 'IB',
    title: 'Operations Manager',
    email: 'ivy.brooks@example.org',
    organization: 'Independent',
    organizationId: 'org_independent',
    type: 'Participant',
    campaign: 'Local Futures Series',
    stage: 'Engaged',
    source: 'Registration',
    timezone: 'America/Phoenix',
    tags: ['Participant'],
    lastInteraction: 'Jul 9, 8:44 AM',
    nextAction: 'Answer accessibility question',
    responseRate: 62,
    consent: 'Granted',
  },
  {
    id: 'ct_owen_kim',
    name: 'Owen Kim',
    initials: 'OK',
    title: 'Corporate Affairs Manager',
    email: 'owen.kim@example.org',
    organization: 'Juniper Transit',
    organizationId: 'org_juniper',
    type: 'Sponsor',
    campaign: 'Harbor Summit 2026',
    stage: 'Declined',
    source: 'Manual',
    timezone: 'America/Los_Angeles',
    tags: ['Do not contact'],
    lastInteraction: 'Jun 22, 2:10 PM',
    nextAction: 'None — suppressed',
    responseRate: 0,
    consent: 'Suppressed',
  },
];

export const followUps: FollowUpRecord[] = [
  {
    id: 'fu_amara',
    contactId: 'ct_amara_okafor',
    contact: 'Amara Okafor',
    initials: 'AO',
    organization: 'Solace Renewables',
    campaign: 'Harbor Summit 2026',
    reason: 'Requested impact details before sponsor review',
    due: 'Today, 10:30 AM',
    dueGroup: 'Today',
    priority: 'High',
    status: 'ready',
    statusLabel: 'Draft ready',
    channel: 'Email',
    recommendedWindow: 'Today, 10:45–11:30 AM CDT',
    confidence: 86,
    sufficiency: 'High',
    reasonCodes: ['CONTACT_REPLY_PATTERN', 'CAMPAIGN_HIGH_RESPONSE', 'LOCAL_BUSINESS_HOURS'],
    explanation:
      'Amara answered 4 of 6 prior messages between 10:30 AM and noon. Wednesday is the campaign’s strongest response day, and this window is outside both workspaces’ quiet hours.',
    lastResponse:
      'This looks aligned. Could you send the community impact breakdown before our review on Friday?',
    lastResponseAt: 'Yesterday, 10:18 AM CDT',
    nextAction: 'Share the approved impact brief and offer a 20-minute review call.',
    bobRequestId: 'bgr_amara_01',
    draftId: 'draft_amara_demo',
  },
  {
    id: 'fu_maya',
    contactId: 'ct_maya_chen',
    contact: 'Maya Chen',
    initials: 'MC',
    organization: 'Meridian Outdoor',
    campaign: 'Harbor Summit 2026',
    reason: 'Category exclusivity question is blocking proposal',
    due: 'Overdue by 1h 18m',
    dueGroup: 'Overdue',
    priority: 'High',
    status: 'due',
    statusLabel: 'Follow-up due',
    channel: 'Email',
    recommendedWindow: 'Today, 9:15–10:00 AM PDT',
    confidence: 78,
    sufficiency: 'Medium',
    reasonCodes: ['ORGANIZATION_PATTERN', 'PROPOSAL_STAGE', 'DEADLINE_PROXIMITY'],
    explanation:
      'Meridian contacts respond most often before 10 AM. The proposal deadline is in two business days, increasing urgency without exceeding contact frequency limits.',
    lastResponse:
      'Can you clarify whether the outdoor category would be exclusive at the lead level?',
    lastResponseAt: 'Monday, 4:02 PM PDT',
    nextAction: 'Clarify exclusivity terms using only the approved proposal facts.',
  },
  {
    id: 'fu_luca',
    contactId: 'ct_luca_bianchi',
    contact: 'Luca Bianchi',
    initials: 'LB',
    organization: 'Civic Thread Labs',
    campaign: 'Community Data Collaborative',
    reason: 'Workshop scope needs confirmation',
    due: 'Today, 2:00 PM',
    dueGroup: 'Today',
    priority: 'Medium',
    status: 'awaiting',
    statusLabel: 'Awaiting IBM Bob',
    channel: 'Email',
    recommendedWindow: 'Tomorrow, 9:30–10:15 AM CEST',
    confidence: 64,
    sufficiency: 'Medium',
    reasonCodes: ['COHORT_PATTERN', 'TIMEZONE_ALIGNMENT', 'UNANSWERED_COUNT_SAFE'],
    explanation:
      'Contact history is limited, so the optimizer blends partner-cohort and campaign behavior. Tomorrow morning aligns with Luca’s timezone and avoids quiet hours.',
    lastResponse:
      'The outline is close. Let’s make sure the technical workshop fits into 45 minutes.',
    lastResponseAt: 'Tuesday, 3:42 PM CEST',
    nextAction: 'Confirm the 45-minute scope and request two scheduling options.',
    bobRequestId: 'bgr_luca_02',
  },
  {
    id: 'fu_noah',
    contactId: 'ct_noah_williams',
    contact: 'Noah Williams',
    initials: 'NW',
    organization: 'Brightwater Foundation',
    campaign: 'Youth Navigation Fund',
    reason: 'Outcomes framework promised in last meeting',
    due: 'Tomorrow, 11:00 AM',
    dueGroup: 'Upcoming',
    priority: 'Medium',
    status: 'attention',
    statusLabel: 'Needs attention',
    channel: 'Email',
    recommendedWindow: 'Tomorrow, 11:00–11:45 AM EDT',
    confidence: 52,
    sufficiency: 'Sparse',
    reasonCodes: ['SPARSE_HISTORY', 'COHORT_FALLBACK', 'PROMISE_DUE'],
    explanation:
      'Only one prior response is available. This uses the foundation cohort’s smoothed weekday pattern and the promised delivery time.',
    lastResponse:
      'Please send the outcomes framework when it is ready. That will help our internal review.',
    lastResponseAt: 'Last Friday, 1:30 PM EDT',
    nextAction: 'Send the approved outcomes framework; avoid implying funding commitment.',
  },
  {
    id: 'fu_ivy',
    contactId: 'ct_ivy_brooks',
    contact: 'Ivy Brooks',
    initials: 'IB',
    organization: 'Independent',
    campaign: 'Local Futures Series',
    reason: 'Accessibility accommodation question',
    due: 'Today, 12:00 PM',
    dueGroup: 'Today',
    priority: 'High',
    status: 'due',
    statusLabel: 'Follow-up due',
    channel: 'Email',
    recommendedWindow: 'Now — service response',
    confidence: 91,
    sufficiency: 'High',
    reasonCodes: ['SERVICE_QUESTION', 'HIGH_URGENCY', 'WITHIN_ACTIVE_HOURS'],
    explanation:
      'Accessibility questions are service-critical and this request is within active hours. Prompt handling outweighs historical timing preferences.',
    lastResponse:
      'Will live captioning be available, and is there a quiet room near the main session?',
    lastResponseAt: 'Today, 8:44 AM MST',
    nextAction: 'Confirm the published accessibility arrangements or escalate missing details.',
  },
  {
    id: 'fu_samir',
    contactId: 'ct_samir_patel',
    contact: 'Samir Patel',
    initials: 'SP',
    organization: 'Common Ground Foods',
    campaign: 'Local Futures Series',
    reason: 'Speaker logistics confirmed',
    due: 'Completed 28m ago',
    dueGroup: 'Completed',
    priority: 'Low',
    status: 'complete',
    statusLabel: 'Completed',
    channel: 'Email',
    recommendedWindow: 'Completed',
    confidence: 82,
    sufficiency: 'High',
    reasonCodes: ['COMPLETED'],
    explanation: 'The task was completed and no further outreach is recommended.',
    lastResponse: 'Confirmed. I’ll arrive at 3:30 and bring the final slide deck.',
    lastResponseAt: 'Today, 9:04 AM PDT',
    nextAction: 'No action required.',
  },
];

export const organizations = [
  {
    id: 'org_solace',
    name: 'Solace Renewables',
    type: 'Sponsor',
    industry: 'Clean energy',
    stage: 'Engaged',
    value: '$95,000',
    weighted: '$52,250',
    contacts: 3,
    interest: 'Community resilience',
    signal: 'Clear signal',
  },
  {
    id: 'org_meridian',
    name: 'Meridian Outdoor',
    type: 'Sponsor',
    industry: 'Consumer goods',
    stage: 'Negotiation',
    value: '$120,000',
    weighted: '$90,000',
    contacts: 2,
    interest: 'Outdoor access',
    signal: 'Needs attention',
  },
  {
    id: 'org_brightwater',
    name: 'Brightwater Foundation',
    type: 'Donor',
    industry: 'Philanthropy',
    stage: 'Qualified',
    value: '$80,000',
    weighted: '$28,000',
    contacts: 2,
    interest: 'Youth outcomes',
    signal: 'Awaiting response',
  },
  {
    id: 'org_atlas',
    name: 'Atlas Cooperative Bank',
    type: 'Sponsor',
    industry: 'Financial services',
    stage: 'Contacted',
    value: '$65,000',
    weighted: '$16,250',
    contacts: 4,
    interest: 'Financial inclusion',
    signal: 'Follow up later',
  },
  {
    id: 'org_civic_thread',
    name: 'Civic Thread Labs',
    type: 'Partner',
    industry: 'Civic technology',
    stage: 'Proposal',
    value: '$48,000',
    weighted: '$28,800',
    contacts: 3,
    interest: 'Responsible data',
    signal: 'Draft ready',
  },
  {
    id: 'org_common_ground',
    name: 'Common Ground Foods',
    type: 'Partner',
    industry: 'Food systems',
    stage: 'Committed',
    value: '$22,000',
    weighted: '$22,000',
    contacts: 2,
    interest: 'Local producers',
    signal: 'Clear signal',
  },
];

export const campaigns = [
  {
    id: 'cmp_harbor',
    name: 'Harbor Summit 2026',
    type: 'Sponsorship',
    owner: 'Jordan Lee',
    status: 'Active',
    objective: 'Secure mission-aligned summit sponsors',
    contacts: 42,
    responseRate: 46,
    positiveRate: 31,
    due: 7,
    value: '$287k',
    deadline: 'Aug 14',
  },
  {
    id: 'cmp_data',
    name: 'Community Data Collaborative',
    type: 'Partnership',
    owner: 'Priya Shah',
    status: 'Active',
    objective: 'Recruit technical and community partners',
    contacts: 28,
    responseRate: 39,
    positiveRate: 27,
    due: 4,
    value: '$92k',
    deadline: 'Sep 05',
  },
  {
    id: 'cmp_youth',
    name: 'Youth Navigation Fund',
    type: 'Fundraising',
    owner: 'Jordan Lee',
    status: 'Active',
    objective: 'Fund two cohorts of youth programming',
    contacts: 35,
    responseRate: 29,
    positiveRate: 18,
    due: 5,
    value: '$136k',
    deadline: 'Oct 01',
  },
  {
    id: 'cmp_futures',
    name: 'Local Futures Series',
    type: 'Program',
    owner: 'Morgan Reed',
    status: 'On track',
    objective: 'Confirm participants and speakers',
    contacts: 61,
    responseRate: 62,
    positiveRate: 48,
    due: 2,
    value: '$34k',
    deadline: 'Jul 28',
  },
];

export const recentActivity = [
  {
    time: '10:18',
    title: 'Response classified',
    detail: 'Amara Okafor · Interested',
    kind: 'response',
  },
  {
    time: '09:42',
    title: 'Sheet synchronization complete',
    detail: 'Sponsor pipeline · 14 updated, 2 skipped',
    kind: 'sync',
  },
  {
    time: '09:17',
    title: 'Draft approved',
    detail: 'Local Futures speaker confirmation',
    kind: 'draft',
  },
  {
    time: '08:55',
    title: 'Recommendation accepted',
    detail: 'Maya Chen · 9:15 AM local window',
    kind: 'recommendation',
  },
];

export const sheetSyncRuns = [
  {
    id: 'sync_104',
    source: 'Sponsor pipeline',
    worksheet: 'Active prospects',
    status: 'Complete',
    ranAt: 'Today, 9:42 AM',
    summary: '126 read · 14 updated · 2 skipped',
    issues: 0,
  },
  {
    id: 'sync_103',
    source: 'Program participants',
    worksheet: 'Registrations',
    status: 'Complete',
    ranAt: 'Yesterday, 4:10 PM',
    summary: '241 read · 18 created · 3 updated',
    issues: 0,
  },
  {
    id: 'sync_102',
    source: 'Partner outreach',
    worksheet: 'FY26 partners',
    status: 'Needs review',
    ranAt: 'Jul 8, 8:00 AM',
    summary: '84 read · 79 valid · 5 failed',
    issues: 5,
  },
];

export const bobDrafts = [
  {
    id: 'draft_amara_demo',
    requestId: 'bgr_amara_01',
    contact: 'Amara Okafor',
    campaign: 'Harbor Summit 2026',
    provenance: 'Demo draft',
    status: 'Ready for review',
    promptVersion: 'outreach-draft.v1',
    createdAt: 'Today, 10:22 AM',
    subject: 'Community impact details for Friday’s review',
    body: 'Hi Amara,\n\nThank you for taking a closer look at the Harbor Summit partnership. I’ve attached the approved community impact brief you requested, including the program reach and measurement approach.\n\nWould a 20-minute review on Thursday be useful before your Friday discussion? I’m happy to work around your schedule.\n\nBest,\nJordan',
    rationale: 'Directly answers the latest request and offers a low-friction next step.',
    confidence: 0.84,
    sources: ['response_rsp_204', 'campaign_cmp_harbor', 'asset_impact_brief_26'],
    riskFlags: ['DEMO_CONTENT_REVIEW_REQUIRED'],
  },
  {
    id: 'pending_luca',
    requestId: 'bgr_luca_02',
    contact: 'Luca Bianchi',
    campaign: 'Community Data Collaborative',
    provenance: 'Awaiting IBM Bob',
    status: 'Awaiting IBM Bob',
    promptVersion: 'outreach-draft.v1',
    createdAt: 'Today, 9:58 AM',
    subject: '',
    body: '',
    rationale: '',
    confidence: null,
    sources: ['interaction_int_188', 'campaign_cmp_data'],
    riskFlags: [],
  },
];

export const campaignComparison = campaigns.map((campaign) => ({
  group: campaign.name,
  key: 'Response rate',
  value: campaign.responseRate,
}));

export const responseFunnel = [
  { label: 'Delivered', value: 1284, percent: 100 },
  { label: 'Responses', value: 496, percent: 39 },
  { label: 'Positive', value: 318, percent: 25 },
  { label: 'Meetings', value: 126, percent: 10 },
  { label: 'Committed', value: 43, percent: 3 },
];

export const demoSheetRows = [
  {
    'First name': 'Nia',
    'Last name': 'Hart',
    Email: 'nia.hart@example.org',
    Organization: 'Tidal Works',
    Type: 'Sponsor',
    Timezone: 'America/New_York',
    'Preferred channel': 'Email',
    'External ID': 'TW-104',
  },
  {
    'First name': 'Mateo',
    'Last name': 'Silva',
    Email: 'mateo.silva@example.org',
    Organization: 'Fieldnote Studio',
    Type: 'Partner',
    Timezone: 'America/Chicago',
    'Preferred channel': 'Email',
    'External ID': 'FS-022',
  },
  {
    'First name': 'Rowan',
    'Last name': 'Ellis',
    Email: 'not-an-email',
    Organization: 'Openline Alliance',
    Type: 'Participant',
    Timezone: 'UTC',
    'Preferred channel': 'Email',
    'External ID': 'OA-771',
  },
  {
    'First name': 'Amara',
    'Last name': 'Okafor',
    Email: 'amara.okafor@example.org',
    Organization: 'Solace Renewables',
    Type: 'Sponsor',
    Timezone: 'America/Chicago',
    'Preferred channel': 'Email',
    'External ID': 'SR-001',
  },
];
