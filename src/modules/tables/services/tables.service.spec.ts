import { ReservationStatus, RestaurantTableStatus } from '@prisma/client';
import type Redis from 'ioredis';
import type { PrismaService } from 'src/prisma/prisma.service';
import type { TablesGateway } from 'src/gateway/tables.gateway';
import type { TableLockService } from './table-lock.service';
import { TablesService } from './tables.service';

describe('TablesService auto-expire distributed lock & transaction', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  const createSut = () => {
    const tx = {
      reservation: {
        updateMany: jest.fn(),
        findUnique: jest.fn(),
      },
      restaurantTable: {
        update: jest.fn(),
      },
    };

    const prisma = {
      reservation: {
        findMany: jest.fn(),
      },
      $transaction: jest.fn((cb: (client: typeof tx) => Promise<unknown>) => cb(tx)),
    };

    const redisClient = {
      set: jest.fn(),
      hset: jest.fn(),
      hdel: jest.fn(),
    };

    const tablesGateway = {
      notifyTableStatusChanged: jest.fn(),
      notifyReservationUpdated: jest.fn(),
    };

    const tableLockService = {};

    const service = new TablesService(
      prisma as unknown as PrismaService,
      redisClient as unknown as Redis,
      tablesGateway as unknown as TablesGateway,
      tableLockService as unknown as TableLockService,
    );

    return { service, prisma, tx, redisClient, tablesGateway };
  };

  it('skips scheduled scan when Redis distributed lock is held by another instance', async () => {
    const { service, prisma, redisClient } = createSut();
    redisClient.set.mockResolvedValue(null);

    await service.runScheduledAutoExpire();

    expect(redisClient.set).toHaveBeenCalledWith(
      'tables:auto-expire:interval-lock',
      expect.any(String),
      'PX',
      55000,
      'NX',
    );
    expect(prisma.reservation.findMany).not.toHaveBeenCalled();
  });

  it('runs scheduled scan when Redis distributed lock is acquired', async () => {
    const { service, prisma, redisClient } = createSut();
    redisClient.set.mockResolvedValue('OK');
    prisma.reservation.findMany.mockResolvedValue([]);

    await service.runScheduledAutoExpire();

    expect(prisma.reservation.findMany).toHaveBeenCalledTimes(1);
  });

  it('skips table update, Redis writes, and socket events if reservation was already claimed concurrently', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-10T12:00:00+07:00'));

    const { service, prisma, tx, redisClient, tablesGateway } = createSut();
    prisma.reservation.findMany.mockResolvedValue([
      {
        id: 'res-1',
        reservationCode: 'RES-001',
        branchId: 'branch-1',
        tableId: 'table-1',
        reservationTime: '10:00',
        slotDurationMinutes: 90,
        updatedAt: new Date('2026-11-10T10:05:00+07:00'),
        table: { id: 'table-1', tableNumber: 'B01' },
      },
    ]);
    tx.reservation.updateMany.mockResolvedValue({ count: 0 });

    await service.checkAndAutoExpireSeatedTables();

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.restaurantTable.update).not.toHaveBeenCalled();
    expect(redisClient.hset).not.toHaveBeenCalled();
    expect(tablesGateway.notifyTableStatusChanged).not.toHaveBeenCalled();
    expect(tablesGateway.notifyReservationUpdated).not.toHaveBeenCalled();
  });

  it('updates reservation and table atomically in transaction and emits events once when claimed', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-10T12:00:00+07:00'));

    const { service, prisma, tx, redisClient, tablesGateway } = createSut();
    const updatedRecord = { id: 'res-1', status: ReservationStatus.COMPLETED };

    prisma.reservation.findMany.mockResolvedValue([
      {
        id: 'res-1',
        reservationCode: 'RES-001',
        branchId: 'branch-1',
        tableId: 'table-1',
        reservationTime: '10:00',
        slotDurationMinutes: 90,
        updatedAt: new Date('2026-11-10T10:05:00+07:00'),
        table: { id: 'table-1', tableNumber: 'B01' },
      },
    ]);
    tx.reservation.updateMany.mockResolvedValue({ count: 1 });
    tx.reservation.findUnique.mockResolvedValue(updatedRecord);

    await service.checkAndAutoExpireSeatedTables();

    expect(tx.reservation.updateMany).toHaveBeenCalledWith({
      where: { id: 'res-1', status: ReservationStatus.SEATED },
      data: { status: ReservationStatus.COMPLETED },
    });
    expect(tx.restaurantTable.update).toHaveBeenCalledWith({
      where: { id: 'table-1' },
      data: {
        status: RestaurantTableStatus.DIRTY,
        note: 'Bữa ăn kết thúc tự động sau 90 phút (RES-001)',
      },
    });
    expect(redisClient.hset).toHaveBeenCalledWith(
      'table:dirty-times:branch-1',
      'table-1',
      expect.any(String),
    );
    expect(redisClient.hdel).toHaveBeenCalledWith('table:occupied-times:branch-1', 'table-1');
    expect(tablesGateway.notifyTableStatusChanged).toHaveBeenCalledWith(
      'branch-1',
      expect.objectContaining({
        id: 'table-1',
        status: RestaurantTableStatus.DIRTY,
        tableNumber: 'B01',
      }),
    );
    expect(tablesGateway.notifyReservationUpdated).toHaveBeenCalledWith('branch-1', updatedRecord);
  });
});
