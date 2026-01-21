import crypto from 'crypto';

export const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Access token required' });
  }

  try {
    // Query database for token
    const result = await req.app.get('pool').query(
      'SELECT user_email, scope FROM auth_tokens WHERE token = $1 AND expires_at > NOW()',
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }

    req.user = {
      email: result.rows[0].user_email,
      scope: result.rows[0].scope?.split(' ') || [],
    };

    next();
  } catch (error) {
    console.error('Token authentication error:', error);
    res.status(401).json({ message: 'Authentication failed' });
  }
};

export const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.split(' ')[1];

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const result = await req.app.get('pool').query(
      'SELECT user_email, scope FROM auth_tokens WHERE token = $1 AND expires_at > NOW()',
      [token]
    );

    if (result.rows.length > 0) {
      req.user = {
        email: result.rows[0].user_email,
        scope: result.rows[0].scope?.split(' ') || [],
      };
    }
  } catch (error) {
    console.error('Optional auth error:', error);
  }

  next();
};

export const requireScope = (requiredScope) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (!req.user.scope.includes(requiredScope)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    next();
  };
};
