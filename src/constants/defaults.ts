// Default form values

export interface EventFormData {
  name: string;
  eventDate: string;
  eventTime: string;
  endTime: string;
  eventType: string;
  description: string;
  venueName: string;
  venueAddress: string;
  venueCity: string;
  template: string;
  coverImage: string;
  accentColor: string;
  expectedAttendance: string;
  dressCode: string;
  theme: string;
  ageRestriction: string;
  rsvpEnabled: boolean;
  showGuestList: boolean;
  showGuestCount: boolean;
  allowPlusOne: boolean;
  maxPlusOne: number;
  requireApproval: boolean;
  isPublic: boolean;
  slug: string;
  ticketLink: string;
  notes: string;
}

export const DEFAULT_EVENT_FORM: EventFormData = {
  name: '',
  eventDate: '',
  eventTime: '',
  endTime: '',
  eventType: 'party',
  description: '',
  venueName: '',
  venueAddress: '',
  venueCity: '',
  template: 'elegant-dark',
  coverImage: '',
  accentColor: '#d4af37',
  expectedAttendance: '',
  dressCode: '',
  theme: '',
  ageRestriction: '',
  rsvpEnabled: true,
  showGuestList: false,
  showGuestCount: true,
  allowPlusOne: true,
  maxPlusOne: 1,
  requireApproval: false,
  isPublic: false,
  slug: '',
  ticketLink: '',
  notes: '',
};
