import 'package:flutter/material.dart';

class NotificationModal extends StatelessWidget {
  final bool isOpen;
  final String title;
  final String message;
  final String type; // 'success', 'error', 'warning', 'info'
  final VoidCallback onClose;

  const NotificationModal({
    super.key,
    required this.isOpen,
    required this.title,
    required this.message,
    required this.type,
    required this.onClose,
  });

  @override
  Widget build(BuildContext context) {
    if (!isOpen) return const SizedBox.shrink();

    Color backgroundColor;
    Color iconColor;
    IconData icon;

    switch (type) {
      case 'success':
        backgroundColor = Colors.green.shade50;
        iconColor = Colors.green.shade600;
        icon = Icons.check_circle;
        break;
      case 'error':
        backgroundColor = Colors.red.shade50;
        iconColor = Colors.red.shade600;
        icon = Icons.error;
        break;
      case 'warning':
        backgroundColor = Colors.orange.shade50;
        iconColor = Colors.orange.shade600;
        icon = Icons.warning;
        break;
      case 'info':
      default:
        backgroundColor = Colors.blue.shade50;
        iconColor = Colors.blue.shade600;
        icon = Icons.info;
        break;
    }

    return Material(
      color: Colors.black.withValues(alpha: 0.5),
      child: Center(
        child: Container(
          margin: const EdgeInsets.all(20),
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: backgroundColor,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: iconColor.withValues(alpha: 0.3)),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.1),
                blurRadius: 10,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          constraints: const BoxConstraints(maxWidth: 400),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                children: [
                  Icon(icon, color: iconColor, size: 24),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      title,
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w600,
                        color: iconColor,
                      ),
                    ),
                  ),
                  IconButton(
                    onPressed: onClose,
                    icon: const Icon(Icons.close),
                    iconSize: 20,
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                message,
                style: TextStyle(
                  fontSize: 14,
                  color: iconColor.withValues(alpha: 0.8),
                ),
              ),
              const SizedBox(height: 16),
              Align(
                alignment: Alignment.centerRight,
                child: ElevatedButton(
                  onPressed: onClose,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: iconColor,
                    foregroundColor: Colors.white,
                  ),
                  child: const Text('OK'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
