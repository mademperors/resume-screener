import { ApiKey } from '../api-keys/api-key.entity.js';
import { Session } from '../auth/session.entity.js';
import { Company } from '../companies/company.entity.js';
import { User } from '../users/user.entity.js';

/** Every entity, for the app and the migration CLI. Add new entities here. */
export const ENTITIES = [Company, User, Session, ApiKey];
