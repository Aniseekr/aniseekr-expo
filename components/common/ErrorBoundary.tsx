import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import * as Haptics from 'expo-haptics';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    console.error('ErrorBoundary caught an error:', error);

    if (error instanceof ApiError) {
      return {
        hasError: true,
        error,
        errorInfo: {
          type: 'API Error',
          message: error.message,
          statusCode: error.statusCode,
        },
      };
    }

    if (error instanceof ValidationError) {
      return {
        hasError: true,
        error,
        errorInfo: {
          type: 'Validation Error',
          message: error.message,
          field: error.field,
          value: error.value,
        },
      };
    }

    if (error instanceof NetworkError) {
      return {
        hasError: true,
        error,
        errorInfo: {
          type: 'Network Error',
          message: error.message,
        },
      };
    }

    if (error instanceof AuthenticationError) {
      return {
        hasError: true,
        error,
        errorInfo: {
          type: 'Authentication Error',
          message: error.message,
        },
      };
    }

    return {
      hasError: true,
      error,
      errorInfo: {
        type: 'Unknown Error',
        message: error.message,
      },
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ hasError: true, error, errorInfo });
    Haptics.notificationAsync(Haptics.NotificationFeedbackStyle.Error);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  handleReload = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert('Reload App', 'The app needs to be reloaded to recover from this error.');
  };

  render() {
    if (this.state.hasError && this.state.errorInfo) {
      return (
        <View style={styles.errorContainer}>
          <View style={styles.errorIcon}>
            <Text style={styles.errorIconText}>⚠️</Text>
          </View>

          <View style={styles.errorContent}>
            <Text style={styles.errorTitle}>{this.state.errorInfo.type}</Text>
            <Text style={styles.errorMessage}>{this.state.error.message}</Text>

            {this.state.errorInfo.field && (
              <Text style={styles.errorField}>
                Field: {this.state.errorInfo.field}
              </Text>
            )}

            {this.state.errorInfo.statusCode && (
              <Text style={styles.errorField}>
                Status Code: {this.state.errorInfo.statusCode}
              </Text>
            )}

            {this.state.errorInfo.value !== undefined && (
              <Text style={styles.errorField}>
                Value: {this.state.errorInfo.value}
              </Text>
            )}

            <View style={styles.errorActions}>
              <TouchableOpacity
                style={styles.errorButton}
                onPress={this.handleRetry}
              >
                <Text style={styles.errorButtonText}>Retry</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.errorButton}
                onPress={this.handleReload}
              >
                <Text style={styles.errorButtonText}>Reload App</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      );
    }

    if (this.state.hasError && !this.state.errorInfo) {
      return (
        <View style={styles.errorContainer}>
          <View style={styles.errorIcon}>
            <Text style={styles.errorIconText}>⚠️</Text>
          </View>

          <View style={styles.errorContent}>
            <Text style={styles.errorTitle}>Something went wrong</Text>
            <Text style={styles.errorMessage}>{this.state.error.message}</Text>
            <Text style={styles.errorHint}>This error has been logged for investigation.</Text>

            <TouchableOpacity
              style={styles.errorButton}
              onPress={this.handleReload}
            >
              <Text style={styles.errorButtonText}>Reload App</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return (
      <>
        {this.props.fallback && this.state.hasError ? (
          this.props.fallback
        ) : this.props.children}
      </>
    );
  }
}

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },

  errorIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(239, 68, 68, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },

  errorIconText: {
    fontSize: 32,
  },

  errorContent: {
    alignItems: 'center',
    maxWidth: 300,
  },

  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
  },

  errorMessage: {
    fontSize: 16,
    fontWeight: '400',
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 4,
  },

  errorField: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    marginBottom: 4,
  },

  errorHint: {
    fontSize: 12,
    fontWeight: '400',
    color: 'rgba(255, 255, 255, 0.5)',
    textAlign: 'center',
    marginTop: 8,
  },

  errorActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },

  errorButton: {
    backgroundColor: '#fbbf24',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 20,
    minWidth: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity:  Error 0.3,
    shadowRadius: 6,
    elevation: 4,
  },

  errorButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
});
