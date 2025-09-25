import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  RefreshControl,
} from 'react-native';
import { Contact } from '@/types/contact.types';

interface ContactsScreenProps {
  onContactCall: (contact: Contact) => void;
  onContactEdit?: (contact: Contact) => void;
  onAddContact?: () => void;
}

// Mock contacts data - in a real app, this would come from device contacts or a server
const mockContacts: Contact[] = [
  {
    id: '1',
    name: 'John Doe',
    phoneNumber: '+1234567890',
    email: 'john.doe@example.com',
    avatar: null,
    isFavorite: true,
  },
  {
    id: '2',
    name: 'Jane Smith',
    phoneNumber: '+0987654321',
    email: 'jane.smith@example.com',
    avatar: null,
    isFavorite: false,
  },
  {
    id: '3',
    name: 'Alice Johnson',
    phoneNumber: '+1122334455',
    email: 'alice.johnson@example.com',
    avatar: null,
    isFavorite: true,
  },
  {
    id: '4',
    name: 'Bob Wilson',
    phoneNumber: '+5566778899',
    email: 'bob.wilson@example.com',
    avatar: null,
    isFavorite: false,
  },
  {
    id: '5',
    name: 'Charlie Brown',
    phoneNumber: '+2233445566',
    email: 'charlie.brown@example.com',
    avatar: null,
    isFavorite: false,
  },
];

export const ContactsScreen: React.FC<ContactsScreenProps> = ({
  onContactCall,
  onContactEdit,
  onAddContact,
}) => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  useEffect(() => {
    loadContacts();
  }, []);

  const loadContacts = async () => {
    try {
      // In a real app, you would load from device contacts or API
      setContacts(mockContacts);
    } catch (error) {
      Alert.alert('Error', 'Failed to load contacts');
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadContacts();
    setRefreshing(false);
  };

  const filteredContacts = useMemo(() => {
    let filtered = contacts;

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        contact =>
          contact.name.toLowerCase().includes(query) ||
          contact.phoneNumber.includes(query) ||
          contact.email?.toLowerCase().includes(query)
      );
    }

    // Filter by favorites if enabled
    if (showFavoritesOnly) {
      filtered = filtered.filter(contact => contact.isFavorite);
    }

    // Sort alphabetically by name
    return filtered.sort((a, b) => a.name.localeCompare(b.name));
  }, [contacts, searchQuery, showFavoritesOnly]);

  const handleCall = (contact: Contact) => {
    Alert.alert(
      'Call Contact',
      `Call ${contact.name} at ${contact.phoneNumber}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Call', onPress: () => onContactCall(contact) },
      ]
    );
  };

  const toggleFavorite = (contactId: string) => {
    setContacts(prev =>
      prev.map(contact =>
        contact.id === contactId
          ? { ...contact, isFavorite: !contact.isFavorite }
          : contact
      )
    );
  };

  const getInitials = (name: string): string => {
    return name
      .split(' ')
      .map(part => part.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const renderContact = ({ item }: { item: Contact }) => (
    <TouchableOpacity
      style={styles.contactItem}
      onPress={() => handleCall(item)}
      onLongPress={() => onContactEdit?.(item)}
    >
      <View style={styles.contactInfo}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{getInitials(item.name)}</Text>
        </View>
        <View style={styles.contactDetails}>
          <View style={styles.nameRow}>
            <Text style={styles.contactName}>{item.name}</Text>
            {item.isFavorite && (
              <Text style={styles.favoriteIcon}>⭐</Text>
            )}
          </View>
          <Text style={styles.contactPhone}>{item.phoneNumber}</Text>
          {item.email && (
            <Text style={styles.contactEmail}>{item.email}</Text>
          )}
        </View>
      </View>
      <View style={styles.contactActions}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => toggleFavorite(item.id)}
        >
          <Text style={styles.actionButtonText}>
            {item.isFavorite ? '★' : '☆'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, styles.callActionButton]}
          onPress={() => handleCall(item)}
        >
          <Text style={styles.callActionButtonText}>📞</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  const renderHeader = () => (
    <View style={styles.header}>
      <TextInput
        style={styles.searchInput}
        placeholder="Search contacts..."
        value={searchQuery}
        onChangeText={setSearchQuery}
        clearButtonMode="while-editing"
      />
      <View style={styles.filterButtons}>
        <TouchableOpacity
          style={[
            styles.filterButton,
            !showFavoritesOnly && styles.activeFilterButton,
          ]}
          onPress={() => setShowFavoritesOnly(false)}
        >
          <Text style={[
            styles.filterButtonText,
            !showFavoritesOnly && styles.activeFilterButtonText,
          ]}>
            All ({contacts.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.filterButton,
            showFavoritesOnly && styles.activeFilterButton,
          ]}
          onPress={() => setShowFavoritesOnly(true)}
        >
          <Text style={[
            styles.filterButtonText,
            showFavoritesOnly && styles.activeFilterButtonText,
          ]}>
            Favorites ({contacts.filter(c => c.isFavorite).length})
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderEmpty = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyStateText}>
        {searchQuery
          ? 'No contacts found'
          : showFavoritesOnly
          ? 'No favorite contacts'
          : 'No contacts available'}
      </Text>
      {onAddContact && !searchQuery && (
        <TouchableOpacity style={styles.addButton} onPress={onAddContact}>
          <Text style={styles.addButtonText}>Add Contact</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={filteredContacts}
        keyExtractor={item => item.id}
        renderItem={renderContact}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmpty}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  listContent: {
    flexGrow: 1,
  },
  header: {
    backgroundColor: 'white',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  searchInput: {
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 12,
  },
  filterButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  filterButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#e0e0e0',
    alignItems: 'center',
  },
  activeFilterButton: {
    backgroundColor: '#2196F3',
  },
  filterButtonText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  activeFilterButtonText: {
    color: 'white',
  },
  contactItem: {
    backgroundColor: 'white',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  contactInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#2196F3',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  contactDetails: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  contactName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  favoriteIcon: {
    fontSize: 16,
    marginLeft: 8,
  },
  contactPhone: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  contactEmail: {
    fontSize: 12,
    color: '#999',
  },
  contactActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  callActionButton: {
    backgroundColor: '#4CAF50',
  },
  actionButtonText: {
    fontSize: 18,
    color: '#666',
  },
  callActionButtonText: {
    fontSize: 18,
    color: 'white',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 64,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  addButton: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  addButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default ContactsScreen;