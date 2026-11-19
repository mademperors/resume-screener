import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Public, SessionOnly } from '../common/decorators.js';
import type { UserPrincipal } from '../common/principal.js';
import { AuthService } from './auth.service.js';
import {
  AuthTokensDto,
  GoogleSignInDto,
  MeDto,
  RefreshTokenDto,
} from './dto/auth.dto.js';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('google')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in with a Google ID token' })
  signInWithGoogle(@Body() dto: GoogleSignInDto): Promise<AuthTokensDto> {
    return this.auth.signInWithGoogle(dto.idToken);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange a refresh token for new tokens' })
  refresh(@Body() dto: RefreshTokenDto): Promise<AuthTokensDto> {
    return this.auth.refresh(dto.refreshToken);
  }

  @SessionOnly()
  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'End the current session' })
  signOut(@CurrentUser() user: UserPrincipal): Promise<void> {
    return this.auth.signOut(user.sessionId);
  }

  @SessionOnly()
  @ApiBearerAuth()
  @Get('me')
  @ApiOperation({ summary: 'Current user and company' })
  me(@CurrentUser() user: UserPrincipal): Promise<MeDto> {
    return this.auth.getProfile(user.userId);
  }
}
