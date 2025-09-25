// SIP Configuration Types - Dart equivalent of ReactJS SIP config types

class SIPConfig {
  final String? id; // Unique identifier
  final String? contactNumber; // E.164 format DID (required)
  final String? subusername; // Sub-username for organization
  final String? provider; // User-friendly provider name (required)
  final bool? supportSipActive; // Default: true
  final bool? supportSipNameCalls; // Default: true - Allow display names
  final bool? allowOutgoing; // Default: true
  final bool? preferPCMA; // Default: false - Prefer PCMA codec
  final bool? createFreshRoomAlways; // Default: false
  final bool? sipOnly; // Default: false - Restrict to SIP-to-SIP
  final bool? audioOnly; // Default: true - Enforce audio-only
  final bool? autoRecordSip; // Default: false
  final String? webhookUrl; // Webhook for events
  final String? secureCode; // Security code
  final List<String>? ipAllowList; // Allowed IPs or CIDRs
  final List<String>? ipBlockList; // Blocked IPs or CIDRs
  final List<String>? geoAllowList; // Allowed country codes (ISO 2-letter)
  final List<String>? geoBlockList; // Blocked country codes
  final Map<String, dynamic>? autoAgent; // Auto agent configuration
  final Map<String, dynamic>? peer; // Primary SIP peer configuration
  final Map<String, dynamic>? backupPeer; // Backup SIP peer configuration
  final List<Map<String, String>>? extra; // Additional parameters

  // Legacy fields for backwards compatibility
  final bool? enabled; // Maps to supportSipActive
  final int? priority; // Display priority
  final String? name; // Display name (maps to provider)
  final String? phoneNumber; // Display phone (maps to contactNumber)
  final String? sipAddress; // Calculated SIP address

  const SIPConfig({
    this.id,
    this.contactNumber,
    this.subusername,
    this.provider,
    this.supportSipActive,
    this.supportSipNameCalls,
    this.allowOutgoing,
    this.preferPCMA,
    this.createFreshRoomAlways,
    this.sipOnly,
    this.audioOnly,
    this.autoRecordSip,
    this.webhookUrl,
    this.secureCode,
    this.ipAllowList,
    this.ipBlockList,
    this.geoAllowList,
    this.geoBlockList,
    this.autoAgent,
    this.peer,
    this.backupPeer,
    this.extra,
    this.enabled,
    this.priority,
    this.name,
    this.phoneNumber,
    this.sipAddress,
  });

  factory SIPConfig.fromJson(Map<String, dynamic> json) {
    return SIPConfig(
      id: json['id'] as String?,
      contactNumber: json['contactNumber'] as String?,
      subusername: json['subusername'] as String?,
      provider: json['provider'] as String?,
      supportSipActive: json['supportSipActive'] as bool?,
      supportSipNameCalls: json['supportSipNameCalls'] as bool?,
      allowOutgoing: json['allowOutgoing'] as bool?,
      preferPCMA: json['preferPCMA'] as bool?,
      createFreshRoomAlways: json['createFreshRoomAlways'] as bool?,
      sipOnly: json['sipOnly'] as bool?,
      audioOnly: json['audioOnly'] as bool?,
      autoRecordSip: json['autoRecordSip'] as bool?,
      webhookUrl: json['webhookUrl'] as String?,
      secureCode: json['secureCode'] as String?,
      ipAllowList: (json['ipAllowList'] as List<dynamic>?)?.cast<String>(),
      ipBlockList: (json['ipBlockList'] as List<dynamic>?)?.cast<String>(),
      geoAllowList: (json['geoAllowList'] as List<dynamic>?)?.cast<String>(),
      geoBlockList: (json['geoBlockList'] as List<dynamic>?)?.cast<String>(),
      autoAgent: json['autoAgent'] as Map<String, dynamic>?,
      peer: json['peer'] as Map<String, dynamic>?,
      backupPeer: json['backupPeer'] as Map<String, dynamic>?,
      extra: (json['extra'] as List<dynamic>?)
          ?.map((e) => Map<String, String>.from(e as Map<String, dynamic>))
          .toList(),
      enabled: json['enabled'] as bool?,
      priority: json['priority'] as int?,
      name: json['name'] as String?,
      phoneNumber: json['phoneNumber'] as String?,
      sipAddress: json['sipAddress'] as String?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'contactNumber': contactNumber,
      'subusername': subusername,
      'provider': provider,
      'supportSipActive': supportSipActive,
      'supportSipNameCalls': supportSipNameCalls,
      'allowOutgoing': allowOutgoing,
      'preferPCMA': preferPCMA,
      'createFreshRoomAlways': createFreshRoomAlways,
      'sipOnly': sipOnly,
      'audioOnly': audioOnly,
      'autoRecordSip': autoRecordSip,
      'webhookUrl': webhookUrl,
      'secureCode': secureCode,
      'ipAllowList': ipAllowList,
      'ipBlockList': ipBlockList,
      'geoAllowList': geoAllowList,
      'geoBlockList': geoBlockList,
      'autoAgent': autoAgent,
      'peer': peer,
      'backupPeer': backupPeer,
      'extra': extra,
      'enabled': enabled,
      'priority': priority,
      'name': name,
      'phoneNumber': phoneNumber,
      'sipAddress': sipAddress,
    };
  }

  SIPConfig copyWith({
    String? id,
    String? contactNumber,
    String? subusername,
    String? provider,
    bool? supportSipActive,
    bool? supportSipNameCalls,
    bool? allowOutgoing,
    bool? preferPCMA,
    bool? createFreshRoomAlways,
    bool? sipOnly,
    bool? audioOnly,
    bool? autoRecordSip,
    String? webhookUrl,
    String? secureCode,
    List<String>? ipAllowList,
    List<String>? ipBlockList,
    List<String>? geoAllowList,
    List<String>? geoBlockList,
    Map<String, dynamic>? autoAgent,
    Map<String, dynamic>? peer,
    Map<String, dynamic>? backupPeer,
    List<Map<String, String>>? extra,
    bool? enabled,
    int? priority,
    String? name,
    String? phoneNumber,
    String? sipAddress,
  }) {
    return SIPConfig(
      id: id ?? this.id,
      contactNumber: contactNumber ?? this.contactNumber,
      subusername: subusername ?? this.subusername,
      provider: provider ?? this.provider,
      supportSipActive: supportSipActive ?? this.supportSipActive,
      supportSipNameCalls: supportSipNameCalls ?? this.supportSipNameCalls,
      allowOutgoing: allowOutgoing ?? this.allowOutgoing,
      preferPCMA: preferPCMA ?? this.preferPCMA,
      createFreshRoomAlways:
          createFreshRoomAlways ?? this.createFreshRoomAlways,
      sipOnly: sipOnly ?? this.sipOnly,
      audioOnly: audioOnly ?? this.audioOnly,
      autoRecordSip: autoRecordSip ?? this.autoRecordSip,
      webhookUrl: webhookUrl ?? this.webhookUrl,
      secureCode: secureCode ?? this.secureCode,
      ipAllowList: ipAllowList ?? this.ipAllowList,
      ipBlockList: ipBlockList ?? this.ipBlockList,
      geoAllowList: geoAllowList ?? this.geoAllowList,
      geoBlockList: geoBlockList ?? this.geoBlockList,
      autoAgent: autoAgent ?? this.autoAgent,
      peer: peer ?? this.peer,
      backupPeer: backupPeer ?? this.backupPeer,
      extra: extra ?? this.extra,
      enabled: enabled ?? this.enabled,
      priority: priority ?? this.priority,
      name: name ?? this.name,
      phoneNumber: phoneNumber ?? this.phoneNumber,
      sipAddress: sipAddress ?? this.sipAddress,
    );
  }
}
