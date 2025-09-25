// API and SIP related types - Dart equivalent of remaining TypeScript types

// SIP Configuration Types (from MediaSFU API specification)
class SIPPeerAuthConfig {
  final String? username;
  final String? password;

  const SIPPeerAuthConfig({
    this.username,
    this.password,
  });

  factory SIPPeerAuthConfig.fromJson(Map<String, dynamic> json) {
    return SIPPeerAuthConfig(
      username: json['username'] as String?,
      password: json['password'] as String?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      if (username != null) 'username': username,
      if (password != null) 'password': password,
    };
  }
}

enum SIPTransport { udp, tcp, tls }

class SIPPeerConfig {
  final String? provider; // Provider name specific to this peer
  final String host; // SIP provider's domain/IP
  final int? port; // Default: 5060
  final SIPTransport? transport; // Default: UDP
  final bool? register; // Whether to register with this peer
  final SIPPeerAuthConfig? auth; // Authentication credentials
  final String? providerId; // External identifier for this trunk

  const SIPPeerConfig({
    this.provider,
    required this.host,
    this.port,
    this.transport,
    this.register,
    this.auth,
    this.providerId,
  });

  factory SIPPeerConfig.fromJson(Map<String, dynamic> json) {
    return SIPPeerConfig(
      provider: json['provider'] as String?,
      host: (json['host'] as String?) ?? '',
      port: json['port'] as int?,
      transport: _parseTransport(json['transport'] as String?),
      register: json['register'] as bool?,
      auth: json['auth'] != null
          ? SIPPeerAuthConfig.fromJson(json['auth'] as Map<String, dynamic>)
          : null,
      providerId: json['providerId'] as String?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      if (provider != null) 'provider': provider,
      'host': host,
      if (port != null) 'port': port,
      if (transport != null) 'transport': transport?.name.toUpperCase(),
      if (register != null) 'register': register,
      if (auth != null) 'auth': auth?.toJson(),
      if (providerId != null) 'providerId': providerId,
    };
  }

  static SIPTransport? _parseTransport(String? transport) {
    switch (transport?.toUpperCase()) {
      case 'UDP':
        return SIPTransport.udp;
      case 'TCP':
        return SIPTransport.tcp;
      case 'TLS':
        return SIPTransport.tls;
      default:
        return null;
    }
  }
}

enum SIPPromptType { tts, url }

class SIPInitialPromptConfig {
  // Fields for autoAgent.type === "AI"
  final String? role; // e.g., "Customer Support AI"
  final String? systemPrompt; // Main instructions for the AI
  final bool? speakFirst; // Default: true. If true, AI speaks first.
  final String?
      firstMessage; // Default: "Welcome to {companyName}! How can I assist you today?"
  final String? contextPrompt; // Initial context for AI's first turn
  final List<String>? personalityTraits; // e.g., ["friendly", "efficient"]
  final String? responseGuidelines; // How AI should structure responses
  final String? fallbackBehavior; // What AI says if it cannot fulfill a request
  final int?
      maxResponseLength; // Default: 250. Max characters/tokens for LLM response
  final double? temperature; // Default: 0.7. LLM creativity (0.0-1.0)

  // Fields for IVR/PLAYBACK types
  final SIPPromptType? type; // Type of prompt
  final String? text; // TTS text
  final String? value; // URL value

  const SIPInitialPromptConfig({
    this.role,
    this.systemPrompt,
    this.speakFirst,
    this.firstMessage,
    this.contextPrompt,
    this.personalityTraits,
    this.responseGuidelines,
    this.fallbackBehavior,
    this.maxResponseLength,
    this.temperature,
    this.type,
    this.text,
    this.value,
  });

  factory SIPInitialPromptConfig.fromJson(Map<String, dynamic> json) {
    return SIPInitialPromptConfig(
      role: json['role'] as String?,
      systemPrompt: json['systemPrompt'] as String?,
      speakFirst: json['speakFirst'] as bool?,
      firstMessage: json['firstMessage'] as String?,
      contextPrompt: json['contextPrompt'] as String?,
      personalityTraits: (json['personalityTraits'] as List<dynamic>?)
          ?.map((e) => e as String)
          .toList(),
      responseGuidelines: json['responseGuidelines'] as String?,
      fallbackBehavior: json['fallbackBehavior'] as String?,
      maxResponseLength: json['maxResponseLength'] as int?,
      temperature: (json['temperature'] as num?)?.toDouble(),
      type: _parsePromptType(json['type'] as String?),
      text: json['text'] as String?,
      value: json['value'] as String?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      if (role != null) 'role': role,
      if (systemPrompt != null) 'systemPrompt': systemPrompt,
      if (speakFirst != null) 'speakFirst': speakFirst,
      if (firstMessage != null) 'firstMessage': firstMessage,
      if (contextPrompt != null) 'contextPrompt': contextPrompt,
      if (personalityTraits != null) 'personalityTraits': personalityTraits,
      if (responseGuidelines != null) 'responseGuidelines': responseGuidelines,
      if (fallbackBehavior != null) 'fallbackBehavior': fallbackBehavior,
      if (maxResponseLength != null) 'maxResponseLength': maxResponseLength,
      if (temperature != null) 'temperature': temperature,
      if (type != null) 'type': type?.name.toUpperCase(),
      if (text != null) 'text': text,
      if (value != null) 'value': value,
    };
  }

  static SIPPromptType? _parsePromptType(String? type) {
    switch (type?.toUpperCase()) {
      case 'TTS':
        return SIPPromptType.tts;
      case 'URL':
        return SIPPromptType.url;
      default:
        return null;
    }
  }
}

class SIPAutoAgentSourceConfig {
  final SIPInitialPromptConfig? initialPrompt;

  const SIPAutoAgentSourceConfig({
    this.initialPrompt,
  });

  factory SIPAutoAgentSourceConfig.fromJson(Map<String, dynamic> json) {
    return SIPAutoAgentSourceConfig(
      initialPrompt: json['initialPrompt'] != null
          ? SIPInitialPromptConfig.fromJson(
              json['initialPrompt'] as Map<String, dynamic>)
          : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      if (initialPrompt != null) 'initialPrompt': initialPrompt?.toJson(),
    };
  }
}

enum SIPAutoAgentType { ai, ivr, playback }

class SIPAutoAgentConfig {
  final bool? enabled; // Default: false. Master switch for auto agent.
  final SIPAutoAgentType? type; // Default: AI. Type of automated agent.
  final SIPAutoAgentType?
      outgoingType; // Default: AI. Type for outgoing/outbound calls.
  final SIPAutoAgentSourceConfig? source;
  final String?
      humanInterventionWebhookUrl; // Webhook for AI escalation requests
  final bool?
      agentOnlyMode; // Default: false. If true, AI handles call entirely.
  final bool?
      humanSupportNA; // Default: false. If true, informs caller human support unavailable if escalation fails.

  const SIPAutoAgentConfig({
    this.enabled,
    this.type,
    this.outgoingType,
    this.source,
    this.humanInterventionWebhookUrl,
    this.agentOnlyMode,
    this.humanSupportNA,
  });

  factory SIPAutoAgentConfig.fromJson(Map<String, dynamic> json) {
    return SIPAutoAgentConfig(
      enabled: json['enabled'] as bool?,
      type: _parseAgentType(json['type'] as String?),
      outgoingType: _parseAgentType(json['outgoingType'] as String?),
      source: json['source'] != null
          ? SIPAutoAgentSourceConfig.fromJson(
              json['source'] as Map<String, dynamic>)
          : null,
      humanInterventionWebhookUrl:
          json['humanInterventionWebhookUrl'] as String?,
      agentOnlyMode: json['agentOnlyMode'] as bool?,
      humanSupportNA: json['humanSupportNA'] as bool?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      if (enabled != null) 'enabled': enabled,
      if (type != null) 'type': type?.name.toUpperCase(),
      if (outgoingType != null)
        'outgoingType': outgoingType?.name.toUpperCase(),
      if (source != null) 'source': source?.toJson(),
      if (humanInterventionWebhookUrl != null)
        'humanInterventionWebhookUrl': humanInterventionWebhookUrl,
      if (agentOnlyMode != null) 'agentOnlyMode': agentOnlyMode,
      if (humanSupportNA != null) 'humanSupportNA': humanSupportNA,
    };
  }

  static SIPAutoAgentType? _parseAgentType(String? type) {
    switch (type?.toUpperCase()) {
      case 'AI':
        return SIPAutoAgentType.ai;
      case 'IVR':
        return SIPAutoAgentType.ivr;
      case 'PLAYBACK':
        return SIPAutoAgentType.playback;
      default:
        return null;
    }
  }
}

class SIPConfigExtra {
  final String key;
  final String value;

  const SIPConfigExtra({
    required this.key,
    required this.value,
  });

  factory SIPConfigExtra.fromJson(Map<String, dynamic> json) {
    return SIPConfigExtra(
      key: (json['key'] as String?) ?? '',
      value: (json['value'] as String?) ?? '',
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'key': key,
      'value': value,
    };
  }
}

class SIPConfig {
  final String? id; // Unique identifier
  final String contactNumber; // E.164 format DID (required)
  final String? subusername; // Sub-username for organization
  final String provider; // User-friendly provider name (required)
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
  final SIPAutoAgentConfig? autoAgent; // Auto agent configuration
  final SIPPeerConfig? peer; // Primary SIP peer configuration
  final SIPPeerConfig? backupPeer; // Backup SIP peer configuration
  final List<SIPConfigExtra>? extra; // Additional parameters

  // Legacy fields for backwards compatibility
  final bool? enabled; // Maps to supportSipActive
  final int? priority; // Display priority
  final String? name; // Display name (maps to provider)
  final String? phoneNumber; // Display phone (maps to contactNumber)
  final String? sipAddress; // Calculated SIP address

  const SIPConfig({
    this.id,
    required this.contactNumber,
    this.subusername,
    required this.provider,
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
      contactNumber: (json['contactNumber'] as String?) ?? '',
      subusername: json['subusername'] as String?,
      provider: (json['provider'] as String?) ?? '',
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
      ipAllowList: (json['ipAllowList'] as List<dynamic>?)
          ?.map((e) => e as String)
          .toList(),
      ipBlockList: (json['ipBlockList'] as List<dynamic>?)
          ?.map((e) => e as String)
          .toList(),
      geoAllowList: (json['geoAllowList'] as List<dynamic>?)
          ?.map((e) => e as String)
          .toList(),
      geoBlockList: (json['geoBlockList'] as List<dynamic>?)
          ?.map((e) => e as String)
          .toList(),
      autoAgent: json['autoAgent'] != null
          ? SIPAutoAgentConfig.fromJson(
              json['autoAgent'] as Map<String, dynamic>)
          : null,
      peer: json['peer'] != null
          ? SIPPeerConfig.fromJson(json['peer'] as Map<String, dynamic>)
          : null,
      backupPeer: json['backupPeer'] != null
          ? SIPPeerConfig.fromJson(json['backupPeer'] as Map<String, dynamic>)
          : null,
      extra: (json['extra'] as List<dynamic>?)
          ?.map((e) => SIPConfigExtra.fromJson(e as Map<String, dynamic>))
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
      if (id != null) 'id': id,
      'contactNumber': contactNumber,
      if (subusername != null) 'subusername': subusername,
      'provider': provider,
      if (supportSipActive != null) 'supportSipActive': supportSipActive,
      if (supportSipNameCalls != null)
        'supportSipNameCalls': supportSipNameCalls,
      if (allowOutgoing != null) 'allowOutgoing': allowOutgoing,
      if (preferPCMA != null) 'preferPCMA': preferPCMA,
      if (createFreshRoomAlways != null)
        'createFreshRoomAlways': createFreshRoomAlways,
      if (sipOnly != null) 'sipOnly': sipOnly,
      if (audioOnly != null) 'audioOnly': audioOnly,
      if (autoRecordSip != null) 'autoRecordSip': autoRecordSip,
      if (webhookUrl != null) 'webhookUrl': webhookUrl,
      if (secureCode != null) 'secureCode': secureCode,
      if (ipAllowList != null) 'ipAllowList': ipAllowList,
      if (ipBlockList != null) 'ipBlockList': ipBlockList,
      if (geoAllowList != null) 'geoAllowList': geoAllowList,
      if (geoBlockList != null) 'geoBlockList': geoBlockList,
      if (autoAgent != null) 'autoAgent': autoAgent?.toJson(),
      if (peer != null) 'peer': peer?.toJson(),
      if (backupPeer != null) 'backupPeer': backupPeer?.toJson(),
      if (extra != null) 'extra': extra?.map((e) => e.toJson()).toList(),
      if (enabled != null) 'enabled': enabled,
      if (priority != null) 'priority': priority,
      if (name != null) 'name': name,
      if (phoneNumber != null) 'phoneNumber': phoneNumber,
      if (sipAddress != null) 'sipAddress': sipAddress,
    };
  }
}

// API response structure for call lists
class CallListResponse {
  final bool success;
  final List<Map<String, dynamic>>? calls;
  final String? error;

  const CallListResponse({
    required this.success,
    this.calls,
    this.error,
  });

  factory CallListResponse.fromJson(Map<String, dynamic> json) {
    return CallListResponse(
      success: (json['success'] as bool?) ?? false,
      calls: (json['calls'] as List<dynamic>?)
          ?.map((e) => e as Map<String, dynamic>)
          .toList(),
      error: json['error'] as String?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'success': success,
      if (calls != null) 'calls': calls,
      if (error != null) 'error': error,
    };
  }
}
