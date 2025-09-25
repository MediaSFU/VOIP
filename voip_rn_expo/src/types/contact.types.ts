export interface Contact {
  id: string;
  name: string;
  phoneNumber: string;
  email?: string;
  avatar?: string | null;
  isFavorite: boolean;
  company?: string;
  notes?: string;
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
}