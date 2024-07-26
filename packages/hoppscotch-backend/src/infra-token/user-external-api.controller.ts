import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { AdminService } from 'src/admin/admin.service';
import { InfraTokenGuard } from 'src/guards/infra-token.guard';
import { ThrottlerBehindProxyGuard } from 'src/guards/throttler-behind-proxy.guard';
import {
  DeleteUserInvitationRequest,
  DeleteUserInvitationResponse,
  ExceptionResponse,
  GetUserInvitationResponse,
  GetUsersRequestQuery,
  GetUserResponse,
  UpdateUserRequest,
  UpdateUserAdminStatusRequest,
  UpdateUserAdminStatusResponse,
} from './request-response.dto';
import * as E from 'fp-ts/Either';
import { OffsetPaginationArgs } from 'src/types/input-types.args';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { throwHTTPErr } from 'src/utils';
import { UserService } from 'src/user/user.service';
import { USER_NOT_FOUND, USERS_NOT_FOUND } from 'src/errors';

@ApiTags('User Management API')
@ApiSecurity('infra-token')
@UseGuards(ThrottlerBehindProxyGuard, InfraTokenGuard)
@Controller({ path: 'api/v1/infra' })
export class UserExternalApiController {
  constructor(
    private adminService: AdminService,
    private userService: UserService,
  ) {}

  @Get('user-invitations')
  @ApiOkResponse({
    description: 'Get pending user invitations',
    type: [GetUserInvitationResponse],
  })
  async createUserInvitation(@Query() paginationQuery: OffsetPaginationArgs) {
    const pendingInvitedUsers = await this.adminService.fetchInvitedUsers(
      paginationQuery,
    );

    return plainToInstance(GetUserInvitationResponse, pendingInvitedUsers, {
      excludeExtraneousValues: true,
      enableImplicitConversion: true,
    });
  }

  @Delete('user-invitations')
  @ApiOkResponse({
    description: 'Delete a pending user invitation',
    type: DeleteUserInvitationResponse,
  })
  @ApiBadRequestResponse({ type: ExceptionResponse })
  async deleteUserInvitation(@Body() dto: DeleteUserInvitationRequest) {
    const isDeleted = await this.adminService.revokeUserInvitations(
      dto.inviteeEmails,
    );

    if (E.isLeft(isDeleted)) {
      throwHTTPErr({
        message: isDeleted.left,
        statusCode: HttpStatus.BAD_REQUEST,
      });
    }

    return plainToInstance(
      DeleteUserInvitationResponse,
      { message: isDeleted.right },
      {
        excludeExtraneousValues: true,
        enableImplicitConversion: true,
      },
    );
  }

  @Get('users')
  @ApiOkResponse({
    description: 'Get users list',
    type: [GetUserResponse],
  })
  async getUsers(@Query() query: GetUsersRequestQuery) {
    const users = await this.userService.fetchAllUsersV2(query.searchString, {
      take: query.take,
      skip: query.skip,
    });

    return plainToInstance(GetUserResponse, users, {
      excludeExtraneousValues: true,
      enableImplicitConversion: true,
    });
  }

  @Patch('users/:uid')
  @ApiOkResponse({
    description: 'Update user display name',
    type: GetUserResponse,
  })
  @ApiBadRequestResponse({ type: ExceptionResponse })
  @ApiNotFoundResponse({ type: ExceptionResponse })
  async updateUser(@Param('uid') uid: string, @Body() body: UpdateUserRequest) {
    const updatedUser = await this.userService.updateUserDisplayName(
      uid,
      body.displayName,
    );

    if (E.isLeft(updatedUser)) {
      const statusCode =
        (updatedUser.left as string) === USER_NOT_FOUND
          ? HttpStatus.NOT_FOUND
          : HttpStatus.BAD_REQUEST;

      throwHTTPErr({ message: updatedUser.left, statusCode });
    }

    return plainToInstance(GetUserResponse, updatedUser.right, {
      excludeExtraneousValues: true,
      enableImplicitConversion: true,
    });
  }

  @Patch('users/:uid/admin-status')
  @ApiOkResponse({
    description: 'Update user admin status',
    type: UpdateUserAdminStatusResponse,
  })
  @ApiBadRequestResponse({ type: ExceptionResponse })
  @ApiNotFoundResponse({ type: ExceptionResponse })
  async updateUserAdminStatus(
    @Param('uid') uid: string,
    @Body() body: UpdateUserAdminStatusRequest,
  ) {
    let updatedUser;

    if (body.isAdmin) {
      updatedUser = await this.adminService.makeUsersAdmin([uid]);
    } else {
      updatedUser = await this.adminService.demoteUsersByAdmin([uid]);
    }

    if (E.isLeft(updatedUser)) {
      const statusCode =
        (updatedUser.left as string) === USERS_NOT_FOUND
          ? HttpStatus.NOT_FOUND
          : HttpStatus.BAD_REQUEST;

      throwHTTPErr({ message: updatedUser.left as string, statusCode });
    }

    return plainToInstance(
      UpdateUserAdminStatusResponse,
      { message: updatedUser.right },
      {
        excludeExtraneousValues: true,
        enableImplicitConversion: true,
      },
    );
  }
}
