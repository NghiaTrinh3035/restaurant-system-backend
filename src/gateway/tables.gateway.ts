import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger, Inject, forwardRef } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { TableLockService } from 'src/modules/tables/services/table-lock.service';
import { AuthJwtService } from 'src/core/security/jwt/auth-jwt.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { BranchJoinDto, TableLockDto } from './dto/table-lock.dto';

@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true,
  },
})
export class TablesGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(TablesGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    @Inject(forwardRef(() => TableLockService))
    private readonly tableLockService: TableLockService,
    private readonly authJwtService: AuthJwtService,
    private readonly prisma: PrismaService,
  ) {}

  afterInit(server: Server) {
    this.logger.log('WebSocket Gateway Initialized (Socket.IO)');
  }

  async handleConnection(client: Socket) {
    const token = this.extractToken(client);
    if (token) {
      try {
        const payload = this.authJwtService.verifyAccessToken(token);
        const user = await this.prisma.user.findUnique({
          where: { id: payload.sub },
          select: {
            id: true,
            email: true,
            role: true,
            branchId: true,
            isActive: true,
          },
        });

        if (user && user.isActive) {
          client.data.user = user;
          this.logger.log(`Client authenticated: ${client.id} (User: ${user.email}, Role: ${user.role})`);
        } else {
          client.data.user = null;
        }
      } catch (err) {
        client.data.user = null;
        this.logger.debug(`Client connected as Guest (Invalid token): ${client.id}`);
      }
    } else {
      client.data.user = null;
      this.logger.log(`Client connected as Guest: ${client.id}`);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  private extractToken(client: Socket): string | null {
    const authToken = client.handshake?.auth?.token;
    if (authToken && typeof authToken === 'string') {
      return authToken.startsWith('Bearer ') ? authToken.slice(7) : authToken;
    }

    const headerAuth = client.handshake?.headers?.authorization;
    if (headerAuth && typeof headerAuth === 'string') {
      return headerAuth.startsWith('Bearer ') ? headerAuth.slice(7) : headerAuth;
    }

    // Đăng nhập lưu accessToken trong httpOnly cookie (giống JwtStrategy cho REST)
    const cookieHeader = client.handshake?.headers?.cookie;
    if (cookieHeader && typeof cookieHeader === 'string') {
      const accessCookie = cookieHeader
        .split(';')
        .map((part) => part.trim())
        .find((part) => part.startsWith('accessToken='));
      if (accessCookie) {
        return decodeURIComponent(accessCookie.slice('accessToken='.length));
      }
    }

    return null;
  }

  /**
   * Tham gia vào Room theo chi nhánh: `branch:{branchId}`
   */
  @SubscribeMessage('branch:join')
  async handleJoinBranch(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: BranchJoinDto,
  ) {
    if (!dto || !dto.branchId) {
      client.emit('error', { message: 'branchId là bắt buộc khi tham gia room' });
      return;
    }

    const room = `branch:${dto.branchId}`;
    await client.join(room);
    this.logger.log(`Client ${client.id} joined room ${room}`);

    client.emit('branch:joined', {
      branchId: dto.branchId,
      room,
      message: `Đã kết nối vào phòng chi nhánh thành công.`,
    });
  }

  /**
   * Rời khỏi Room theo chi nhánh
   */
  @SubscribeMessage('branch:leave')
  async handleLeaveBranch(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: BranchJoinDto,
  ) {
    if (!dto || !dto.branchId) return;

    const room = `branch:${dto.branchId}`;
    await client.leave(room);
    this.logger.log(`Client ${client.id} left room ${room}`);

    client.emit('branch:left', {
      branchId: dto.branchId,
      room,
    });
  }

  /**
   * Giữ bàn tạm thời (Table Lock) cho một khung giờ - Khách hàng chọn bàn trong lúc đặt chỗ
   */
  @SubscribeMessage('table:lock')
  async handleTableLock(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: TableLockDto,
  ) {
    // 1. Kiểm tra xác thực người dùng & dữ liệu đầu vào
    if (!client.data?.user) {
      client.emit('table:lock_failed', {
        tableId: dto?.tableId,
        branchId: dto?.branchId,
        reason: 'Vui lòng đăng nhập tài khoản để thực hiện giữ bàn.',
      });
      return;
    }

    const invalidReason = await this.validateLockDto(dto);
    if (invalidReason) {
      client.emit('table:lock_failed', { tableId: dto?.tableId, branchId: dto?.branchId, reason: invalidReason });
      return;
    }

    const user = client.data.user;

    // 2. Gọi service thực hiện atomic Redis lock theo khung giờ (mặc định 600s = 10 phút)
    const result = await this.tableLockService.lockTable(
      dto,
      { id: user.id, email: user.email },
      600,
    );

    const room = `branch:${dto.branchId}`;

    // Bàn cũ của người dùng (nếu có) đã được nhả để giữ bàn mới
    if (result.releasedLock) {
      this.server.to(room).emit('table:released', result.releasedLock);
    }

    if (!result.success) {
      client.emit('table:lock_failed', {
        tableId: dto.tableId,
        branchId: dto.branchId,
        reason: result.reason,
      });
      return;
    }

    // 3. Broadcast sự kiện tới toàn bộ người dùng trong phòng chi nhánh
    this.server.to(room).emit('table:locked', result.lockInfo);

    // 4. Phản hồi xác nhận thành công riêng cho client yêu cầu
    client.emit('table:lock_success', result.lockInfo);

    this.logger.log(
      `Table ${dto.tableId} (${dto.date} ${dto.time}) in branch ${dto.branchId} locked by user ${user.email}`,
    );
  }

  /**
   * Hủy giữ bàn (Table Release) - Khách hàng đổi ý hoặc đổi khung giờ
   */
  @SubscribeMessage('table:release')
  async handleTableRelease(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: TableLockDto,
  ) {
    if (!client.data?.user) {
      client.emit('table:release_failed', {
        tableId: dto?.tableId,
        branchId: dto?.branchId,
        reason: 'Vui lòng đăng nhập tài khoản để thực hiện mở khóa bàn.',
      });
      return;
    }

    const invalidReason = await this.validateLockDto(dto);
    if (invalidReason) {
      client.emit('table:release_failed', { tableId: dto?.tableId, branchId: dto?.branchId, reason: invalidReason });
      return;
    }

    const user = client.data.user;

    const result = await this.tableLockService.releaseTable(dto, { id: user.id, role: user.role });

    if (!result.success) {
      client.emit('table:release_failed', {
        tableId: dto.tableId,
        branchId: dto.branchId,
        reason: result.reason,
      });
      return;
    }

    const room = `branch:${dto.branchId}`;
    const payload = { tableId: dto.tableId, branchId: dto.branchId, date: dto.date, time: dto.time };

    // Broadcast cho toàn phòng chi nhánh biết bàn đã được thả
    this.server.to(room).emit('table:released', payload);
    client.emit('table:release_success', payload);

    this.logger.log(
      `Table ${dto.tableId} (${dto.date} ${dto.time}) in branch ${dto.branchId} released by user ${user.email}`,
    );
  }

  /**
   * Phát sự kiện bàn đã được đặt thành công (khóa tạm chuyển thành đơn đặt bàn)
   */
  notifyTableReserved(payload: { branchId: string; tableId: string; date: string; time: string }) {
    const room = `branch:${payload.branchId}`;
    this.server.to(room).emit('table:released', payload);
    this.server.to(room).emit('table:reserved', payload);
  }

  // WebSocket không đi qua ValidationPipe toàn cục nên validate thủ công
  private async validateLockDto(dto: TableLockDto): Promise<string | null> {
    const errors = await validate(plainToInstance(TableLockDto, dto ?? {}));
    if (errors.length === 0) return null;
    return Object.values(errors[0].constraints ?? {})[0] ?? 'Dữ liệu giữ bàn không hợp lệ.';
  }

  /**
   * Helper method phát sự kiện thay đổi trạng thái bàn (dành cho Admin/Staff cập nhật từ REST API)
   */
  notifyTableStatusChanged(branchId: string, tableData: any) {
    const room = `branch:${branchId}`;
    this.server.to(room).emit('table:status_changed', tableData);
  }
}
